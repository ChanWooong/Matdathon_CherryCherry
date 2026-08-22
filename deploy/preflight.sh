#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
CHECK_ONLY=0

if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--check-only]" >&2
  exit 2
fi

failed=0
for command_name in az curl openssl python3 tar; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "ERROR: required command not found: ${command_name}" >&2
    failed=1
  fi
done

required_files=(
  ".dockerignore"
  "deploy/Dockerfile"
  "deploy/main.bicep"
  "frontend/package.json"
  "frontend/package-lock.json"
  "frontend/index.html"
  "frontend/vite.config.ts"
  "backend/pyproject.toml"
  "backend/app/main.py"
)
for relative_path in "${required_files[@]}"; do
  if [[ ! -f "${ROOT_DIR}/${relative_path}" ]]; then
    echo "ERROR: required file not found: ${relative_path}" >&2
    failed=1
  fi
done
for relative_path in frontend/src backend/app; do
  if [[ ! -d "${ROOT_DIR}/${relative_path}" ]]; then
    echo "ERROR: required directory not found: ${relative_path}" >&2
    failed=1
  fi
done

if [[ "${failed}" != 0 ]]; then
  exit 1
fi

if [[ "${CHECK_ONLY}" == 1 ]]; then
  echo "Preflight check passed (Azure login and deployment secrets were not checked)."
  exit 0
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITHUB_TOKEN must be set." >&2
  exit 1
fi

if ! az account show --output none >/dev/null 2>&1; then
  echo "ERROR: Azure CLI is not logged in. Run: az login" >&2
  exit 1
fi

if ! az extension show --name containerapp --output none >/dev/null 2>&1; then
  echo "ERROR: Azure CLI containerapp extension is required." >&2
  echo "Install it with: az extension add --name containerapp --upgrade" >&2
  exit 1
fi

if ! az bicep version >/dev/null 2>&1; then
  echo "ERROR: Azure CLI Bicep support is required. Run: az bicep install" >&2
  exit 1
fi

providers=(
  Microsoft.App
  Microsoft.ContainerRegistry
  Microsoft.KeyVault
  Microsoft.ManagedIdentity
  Microsoft.CognitiveServices
  Microsoft.Insights
  Microsoft.OperationalInsights
)
missing_providers=()
for provider in "${providers[@]}"; do
  state="$(az provider show --namespace "${provider}" --query registrationState -o tsv)"
  if [[ "${state}" != "Registered" ]]; then
    missing_providers+=("${provider}")
  fi
done
if [[ "${#missing_providers[@]}" -gt 0 ]]; then
  echo "ERROR: Azure resource providers are not registered:" >&2
  printf '  %s\n' "${missing_providers[@]}" >&2
  echo "Register each with: az provider register --namespace <name> --wait" >&2
  exit 1
fi

echo "Preflight check passed."
