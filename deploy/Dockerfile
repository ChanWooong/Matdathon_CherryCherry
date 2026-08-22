FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/index.html frontend/tsconfig*.json frontend/vite.config.ts ./
COPY frontend/src ./src

ARG VITE_API_URL=/api
ARG VITE_API_MODE=live
ARG VITE_DEMO_BYPASS_AUTH=true
ARG VITE_API_KEY=""
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_API_MODE=${VITE_API_MODE} \
    VITE_DEMO_BYPASS_AUTH=${VITE_DEMO_BYPASS_AUTH} \
    VITE_API_KEY=${VITE_API_KEY}

RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN printf '# Package metadata\n' > README.md \
    && pip install --no-cache-dir ".[azure]" \
    && rm README.md \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app

COPY --from=frontend-builder --chown=appuser:appuser /build/frontend/dist /app/static

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
