#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
DEFAULT_OUTPUT="${ROOT_DIR}/artifacts/meettoissue-deploy.tar.gz"
OUTPUT="${1:-${DEFAULT_OUTPUT}}"

if [[ "${OUTPUT}" != /* ]]; then
  OUTPUT="${PWD}/${OUTPUT}"
fi
mkdir -p -- "$(dirname -- "${OUTPUT}")"
OUTPUT_DIR="$(cd -- "$(dirname -- "${OUTPUT}")" && pwd -P)"
OUTPUT="${OUTPUT_DIR}/$(basename -- "${OUTPUT}")"

case "${OUTPUT}" in
  *.tar.gz) ;;
  *)
    echo "ERROR: output must end in .tar.gz" >&2
    exit 2
    ;;
esac

STAGING="${ROOT_DIR}/.deployment-package.$$"
if [[ -e "${STAGING}" ]]; then
  echo "ERROR: staging path already exists: ${STAGING}" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${STAGING:-}" && "${STAGING}" == "${ROOT_DIR}"/.deployment-package.* ]]; then
    rm -rf -- "${STAGING}"
  fi
}
trap cleanup EXIT

mkdir -p "${STAGING}/frontend" "${STAGING}/backend" "${STAGING}/deploy"

cp -R "${ROOT_DIR}/frontend/src" "${STAGING}/frontend/src"
cp \
  "${ROOT_DIR}/frontend/index.html" \
  "${ROOT_DIR}/frontend/package.json" \
  "${ROOT_DIR}/frontend/package-lock.json" \
  "${ROOT_DIR}/frontend/tsconfig.json" \
  "${ROOT_DIR}/frontend/tsconfig.app.json" \
  "${ROOT_DIR}/frontend/tsconfig.node.json" \
  "${ROOT_DIR}/frontend/vite.config.ts" \
  "${STAGING}/frontend/"

cp -R "${ROOT_DIR}/backend/app" "${STAGING}/backend/app"
cp "${ROOT_DIR}/backend/pyproject.toml" "${STAGING}/backend/"
cp \
  "${ROOT_DIR}/deploy/Dockerfile" \
  "${ROOT_DIR}/deploy/main.bicep" \
  "${ROOT_DIR}/deploy/deploy.sh" \
  "${ROOT_DIR}/deploy/package.sh" \
  "${ROOT_DIR}/deploy/preflight.sh" \
  "${ROOT_DIR}/deploy/README.md" \
  "${STAGING}/deploy/"
cp "${ROOT_DIR}/.dockerignore" "${STAGING}/"

find "${STAGING}" -type d \( -name __pycache__ -o -name .pytest_cache \) \
  -prune -exec rm -rf -- {} +
find "${STAGING}" -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '.DS_Store' \) \
  -delete
find "${STAGING}" -depth -type d -empty -delete

tar -C "${STAGING}" -czf "${OUTPUT}" .
echo "Created ${OUTPUT}"
