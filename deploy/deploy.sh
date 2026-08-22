#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"

RESOURCE_GROUP="${1:-rg-meettoissue-prod}"
LOCATION="${2:-koreacentral}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
NAME_PREFIX="${NAME_PREFIX:-meettoissue}"
IMAGE_TAG="${IMAGE_TAG:-$(date -u +%Y%m%d%H%M%S)}"
AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:-gpt-4o}"
AZURE_OPENAI_MODEL_NAME="${AZURE_OPENAI_MODEL_NAME:-gpt-4o}"
AZURE_OPENAI_MODEL_VERSION="${AZURE_OPENAI_MODEL_VERSION:-2024-11-20}"
AZURE_OPENAI_CAPACITY="${AZURE_OPENAI_CAPACITY:-30}"
APP_RESOURCE_NAME="ca-${NAME_PREFIX}-${ENVIRONMENT}"
DEPLOYMENT_NAME="meettoissue-${IMAGE_TAG}"

"${SCRIPT_DIR}/preflight.sh"

if [[ "${ENVIRONMENT}" != "dev" && "${ENVIRONMENT}" != "prod" ]]; then
  echo "ERROR: ENVIRONMENT must be dev or prod." >&2
  exit 2
fi

generated_api_key=0
if [[ -z "${API_KEY:-}" ]]; then
  API_KEY="$(openssl rand -hex 32)"
  generated_api_key=1
fi

echo "Preparing resource group ${RESOURCE_GROUP} in ${LOCATION}"
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output none

# Preserve the live image during repeat deployments instead of briefly reverting
# the app to the bootstrap image while infrastructure is reconciled.
current_image="$(
  az containerapp show \
    --name "${APP_RESOURCE_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query 'properties.template.containers[0].image' \
    --output tsv 2>/dev/null || true
)"
bootstrap_port=80
if [[ -n "${current_image}" && "${current_image}" != "mcr.microsoft.com/k8se/quickstart:latest" ]]; then
  bootstrap_port=8000
fi

deployment_parameters=(
  "namePrefix=${NAME_PREFIX}"
  "environmentName=${ENVIRONMENT}"
  "githubToken=${GITHUB_TOKEN}"
  "apiKey=${API_KEY}"
  "modelId=${AZURE_OPENAI_DEPLOYMENT}"
  "openAiModelName=${AZURE_OPENAI_MODEL_NAME}"
  "openAiModelVersion=${AZURE_OPENAI_MODEL_VERSION}"
  "openAiCapacity=${AZURE_OPENAI_CAPACITY}"
  "containerTargetPort=${bootstrap_port}"
)
if [[ -n "${current_image}" ]]; then
  deployment_parameters+=("containerImage=${current_image}")
fi

echo "Deploying Azure infrastructure"
outputs="$(
  az deployment group create \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${SCRIPT_DIR}/main.bicep" \
    --parameters "${deployment_parameters[@]}" \
    --query properties.outputs \
    --output json
)"

read_output() {
  python3 -c \
    "import json,sys; print(json.load(sys.stdin)[sys.argv[1]]['value'])" "$1" \
    <<<"${outputs}"
}

registry="$(read_output registryLoginServer)"
registry_name="$(read_output registryName)"
app_name="$(read_output containerAppName)"
app_url="$(read_output appUrl)"
key_vault="$(read_output keyVaultName)"
openai_endpoint="$(read_output openAiEndpoint)"
openai_deployment="$(read_output openAiDeploymentName)"
image="${registry}/meettoissue:${IMAGE_TAG}"

echo "Building and pushing ${image}"
az acr build \
  --registry "${registry_name}" \
  --image "meettoissue:${IMAGE_TAG}" \
  --file "${SCRIPT_DIR}/Dockerfile" \
  --build-arg "VITE_API_URL=/api" \
  --build-arg "VITE_API_MODE=live" \
  --build-arg "VITE_DEMO_BYPASS_AUTH=true" \
  --build-arg "VITE_API_KEY=${API_KEY}" \
  "${ROOT_DIR}"

echo "Deploying application image"
outputs="$(
  az deployment group create \
    --name "${DEPLOYMENT_NAME}-app" \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${SCRIPT_DIR}/main.bicep" \
    --parameters "namePrefix=${NAME_PREFIX}" \
                 "environmentName=${ENVIRONMENT}" \
                 "githubToken=${GITHUB_TOKEN}" \
                 "apiKey=${API_KEY}" \
                 "modelId=${AZURE_OPENAI_DEPLOYMENT}" \
                 "openAiModelName=${AZURE_OPENAI_MODEL_NAME}" \
                 "openAiModelVersion=${AZURE_OPENAI_MODEL_VERSION}" \
                 "openAiCapacity=${AZURE_OPENAI_CAPACITY}" \
                 "containerImage=${image}" \
                 "containerTargetPort=8000" \
    --query properties.outputs \
    --output json
)"
app_name="$(read_output containerAppName)"
app_url="$(read_output appUrl)"

echo "Waiting for health endpoint"
for attempt in {1..18}; do
  if curl --fail --silent --show-error "${app_url}/health" >/dev/null 2>&1; then
    echo "Application URL: ${app_url}"
    echo "API base URL: ${app_url}/api"
    echo "Health URL: ${app_url}/health"
    echo "Deployment: ${DEPLOYMENT_NAME}"
    echo "Container App: ${app_name}"
    echo "Key Vault: ${key_vault}"
    echo "Azure OpenAI: ${openai_endpoint} (deployment: ${openai_deployment})"
    if [[ "${generated_api_key}" == 1 ]]; then
      echo "Generated demo API key (save it now): ${API_KEY}"
    fi
    exit 0
  fi
  echo "  waiting (${attempt}/18)"
  sleep 10
done

echo "ERROR: health check failed: ${app_url}/health" >&2
echo "Inspect logs: az containerapp logs show -n ${app_name} -g ${RESOURCE_GROUP} --follow" >&2
exit 1
