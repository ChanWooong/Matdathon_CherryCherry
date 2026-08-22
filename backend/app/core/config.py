"""애플리케이션 설정 — 환경변수 + Azure Key Vault."""

from __future__ import annotations

import logging
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # -- 앱 --------------------------------------------------------------
    app_name: str = "MeetToIssue API"
    environment: str = Field(default="local", description="local | dev | prod")
    log_level: str = "INFO"
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        description="쉼표로 구분된 허용 오리진 목록",
    )
    api_key: str = Field(
        default="",
        description=(
            "설정하면 모든 /api 요청에 X-API-Key 헤더를 요구한다. "
            "이 서버는 자신의 GitHub 토큰으로 이슈를 생성하므로, "
            "공개 배포 시에는 반드시 설정해야 한다."
        ),
    )

    # -- 모델 -------------------------------------------------------------
    github_token: str = Field(default="", description="이슈 생성용 GitHub 토큰")
    model_provider: str = Field(
        default="copilot_sdk",
        description="azure_openai | copilot_sdk | github_models(폐지됨)",
    )
    # GitHub Models 전용. 2026-07-30 폐지되어 410을 반환한다.
    model_base_url: str = "https://models.github.ai/inference"
    model_id: str = Field(
        default="gpt-4o",
        description="azure_openai에서는 배포(deployment) 이름",
    )
    model_id_fast: str = "gpt-4o-mini"
    model_temperature: float = 0.2
    model_timeout_s: float = 60.0
    pr_review_max_diff_chars: int = Field(default=100_000, ge=1_000, le=1_000_000)

    # -- 파이프라인 -------------------------------------------------------
    max_retries: int = Field(default=2, description="에이전트 단계별 재시도 횟수")
    stage_timeout_s: float = 90.0
    issue_create_concurrency: int = 3

    # -- 개인정보 ---------------------------------------------------------
    persist_transcript: bool = Field(
        default=False,
        description="회의록 원문 저장 여부. 기본 False — 이력에는 요약만 남긴다.",
    )
    history_enabled: bool = True
    history_db_path: str = "data/history.db"

    # -- Azure ------------------------------------------------------------
    azure_openai_endpoint: str = Field(
        default="",
        description="예: https://<리소스>.openai.azure.com/",
    )
    azure_openai_api_key: str = Field(
        default="",
        description="비우면 DefaultAzureCredential(관리 ID)로 인증한다.",
    )
    azure_openai_api_version: str = "2024-10-21"
    azure_key_vault_url: str = ""
    applicationinsights_connection_string: str = ""

    @field_validator("environment")
    @classmethod
    def _norm_env(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("model_provider")
    @classmethod
    def _valid_provider(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in {"azure_openai", "copilot_sdk", "github_models"}:
            raise ValueError(
                "MODEL_PROVIDER는 'azure_openai', 'copilot_sdk', "
                "'github_models'(폐지됨) 중 하나여야 합니다."
            )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment in {"prod", "production"}

    @property
    def telemetry_enabled(self) -> bool:
        return bool(self.applicationinsights_connection_string)


def _load_secrets_from_key_vault(settings: Settings) -> None:
    """Key Vault가 설정된 경우 비밀 값을 덮어쓴다.

    운영 환경에서는 GITHUB_TOKEN을 환경변수 대신 Key Vault에서 읽어
    이미지·설정에 토큰이 남지 않게 한다. 실패해도 앱은 계속 뜨되 경고를 남긴다.
    """
    if not settings.azure_key_vault_url:
        return

    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient
    except ImportError:
        logger.warning(
            "AZURE_KEY_VAULT_URL이 설정됐지만 azure-identity/azure-keyvault-secrets가 "
            "설치되지 않았습니다. 환경변수 값을 그대로 사용합니다."
        )
        return

    try:
        client = SecretClient(
            vault_url=settings.azure_key_vault_url,
            credential=DefaultAzureCredential(),
        )
    except Exception as exc:  # pragma: no cover - 네트워크 의존
        logger.warning("Key Vault 클라이언트를 만들지 못했습니다: %s", exc)
        return

    # 비밀 값은 개별적으로 읽는다 — 하나가 없어도 나머지는 반영되게.
    for secret_name, field in (
        ("github-token", "github_token"),
        ("api-key", "api_key"),
        ("azure-openai-api-key", "azure_openai_api_key"),
    ):
        try:
            secret = client.get_secret(secret_name)
        except Exception as exc:  # pragma: no cover - 네트워크 의존
            logger.warning("Key Vault에서 %s를 읽지 못했습니다: %s", secret_name, exc)
            continue
        if secret.value:
            setattr(settings, field, secret.value)
            logger.info("%s를 Key Vault에서 불러왔습니다.", secret_name)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    _load_secrets_from_key_vault(settings)
    return settings
