#!/usr/bin/env bash
# 반복 가능한 배포 스크립트 (평가 기준 3번: 반복 가능한 배포)
#
# 사용법:
#   export GITHUB_TOKEN=ghp_...
#   ./infra/deploy.sh [리소스그룹명] [리전]
#
# 1회차: 인프라만 올라가고 기본 이미지가 뜬다.
# 2회차부터: 이미지를 빌드·푸시하고 컨테이너 앱을 갱신한다.

set -euo pipefail

RESOURCE_GROUP="${1:-rg-meettoissue-dev}"
LOCATION="${2:-koreacentral}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI(az)가 필요합니다: https://aka.ms/azure-cli" >&2
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN 환경변수가 필요합니다 (이슈 생성용, Key Vault에 저장됩니다)." >&2
  exit 1
fi

# API 키가 없으면 만들어 준다. 서버는 이 값을 Key Vault에서 읽어
# 모든 /api 요청의 X-API-Key와 대조한다. (인증 없이 공개되면 서버의
# GitHub 토큰 권한을 누구나 빌려 쓸 수 있으므로 필수다.)
GENERATED_API_KEY=0
if [[ -z "${API_KEY:-}" ]]; then
  API_KEY=$(openssl rand -hex 32)
  GENERATED_API_KEY=1
fi

echo "▶ 리소스 그룹 준비: ${RESOURCE_GROUP} (${LOCATION})"
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --output none

echo "▶ 인프라 배포 (Bicep)"
OUTPUTS=$(az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters environmentName="${ENVIRONMENT}" \
               githubToken="${GITHUB_TOKEN}" \
               apiKey="${API_KEY}" \
  --query properties.outputs --output json)

REGISTRY=$(echo "${OUTPUTS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['registryLoginServer']['value'])")
APP_NAME=$(echo "${OUTPUTS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['containerAppName']['value'])")
API_URL=$(echo "${OUTPUTS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['apiUrl']['value'])")
OPENAI_ENDPOINT=$(echo "${OUTPUTS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['openAiEndpoint']['value'])")

echo "▶ 이미지 빌드 및 푸시: ${REGISTRY}/meettoissue-api:${IMAGE_TAG}"
az acr build \
  --registry "${REGISTRY%%.*}" \
  --image "meettoissue-api:${IMAGE_TAG}" \
  --file Dockerfile \
  .

echo "▶ 컨테이너 앱 갱신"
az containerapp update \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${REGISTRY}/meettoissue-api:${IMAGE_TAG}" \
  --output none

echo "▶ 헬스 체크"
for attempt in {1..10}; do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    echo "✅ 배포 완료: ${API_URL}"
    curl -s "${API_URL}/health"
    echo
    if [[ "${GENERATED_API_KEY}" == "1" ]]; then
      echo
      echo "🔑 API 키를 새로 생성했습니다. 프론트엔드의 X-API-Key 헤더에 사용하세요:"
      echo "   ${API_KEY}"
      echo "   (다시 보려면: az keyvault secret show --vault-name <kv> --name api-key)"
    fi
    echo
    echo "🧠 모델 엔드포인트: ${OPENAI_ENDPOINT}"
    exit 0
  fi
  echo "   대기 중... (${attempt}/10)"
  sleep 10
done

echo "⚠️  헬스 체크가 실패했습니다. 로그를 확인하세요:" >&2
echo "   az containerapp logs show -n ${APP_NAME} -g ${RESOURCE_GROUP} --follow" >&2
exit 1
