"""모델 연결 계층.

세 가지 공급자를 지원한다.

- ``azure_openai`` (기본): Azure OpenAI / Azure AI Foundry 배포. API 키 또는
  관리 ID(``DefaultAzureCredential``)로 인증한다. 구조화 출력(response_format)이
  안정적이라 서버 파이프라인에 적합하다.
- ``copilot_sdk``: ``agent-framework-github-copilot`` 패키지가 제공하는
  ``GitHubCopilotAgent``. GitHub Copilot SDK(JSON-RPC로 Copilot CLI 제어)를
  그대로 사용한다.
- ``github_models``: **2026-07-30 폐지됨.** 엔드포인트가 HTTP 410을 반환하므로
  신규 사용 불가. 과거 설정과의 호환을 위해서만 남겨두고, 선택 시 경고한다.

세 경로 모두 Microsoft Agent Framework의 ``SupportsAgentRun`` 계약을 만족하므로
오케스트레이터는 어느 쪽인지 알 필요가 없다.
"""

from __future__ import annotations

import logging
from typing import Any

from agent_framework import Agent, SupportsAgentRun
from agent_framework.openai import OpenAIChatCompletionClient

from app.core.config import Settings

logger = logging.getLogger(__name__)


class ModelConfigurationError(RuntimeError):
    """모델 공급자를 초기화할 수 없을 때."""


def _build_azure_openai_client(
    settings: Settings, model: str | None = None
) -> OpenAIChatCompletionClient:
    """Azure OpenAI(또는 Azure AI Foundry) 배포에 연결된 클라이언트.

    API 키가 있으면 그것을 쓰고, 없으면 ``DefaultAzureCredential``로
    관리 ID 인증을 시도한다. 후자가 운영 환경 권장 경로다 —
    컨테이너에 키를 두지 않아도 된다.
    """
    if not settings.azure_openai_endpoint:
        raise ModelConfigurationError(
            "AZURE_OPENAI_ENDPOINT가 필요합니다 "
            "(예: https://<리소스>.openai.azure.com/). "
            "Azure 리소스가 없다면 MODEL_PROVIDER=copilot_sdk를 사용하세요."
        )

    kwargs: dict[str, Any] = {
        "model": model or settings.model_id,
        "azure_endpoint": settings.azure_openai_endpoint,
        "api_version": settings.azure_openai_api_version,
    }

    if settings.azure_openai_api_key:
        kwargs["api_key"] = settings.azure_openai_api_key
    else:
        try:
            from azure.identity import DefaultAzureCredential
        except ImportError as exc:  # pragma: no cover - 선택 의존성
            raise ModelConfigurationError(
                "AZURE_OPENAI_API_KEY가 없어 관리 ID 인증을 시도했지만 "
                "azure-identity가 설치되지 않았습니다. "
                '`pip install -e ".[azure]"`를 실행하거나 API 키를 설정하세요.'
            ) from exc
        kwargs["credential"] = DefaultAzureCredential()

    return OpenAIChatCompletionClient(**kwargs)


def _build_github_models_client(
    settings: Settings, model: str | None = None
) -> OpenAIChatCompletionClient:
    """GitHub Models 엔드포인트에 연결된 Chat Completions 클라이언트.

    Responses API가 아닌 Chat Completions API를 쓰는 이유는
    GitHub Models가 후자만 OpenAI 호환으로 제공하기 때문이다.
    """
    logger.warning(
        "MODEL_PROVIDER=github_models는 2026-07-30에 폐지되어 HTTP 410을 반환합니다. "
        "MODEL_PROVIDER=azure_openai 또는 copilot_sdk로 이전하세요."
    )
    if not settings.github_token:
        raise ModelConfigurationError(
            "GITHUB_TOKEN이 필요합니다. GitHub Models 추론과 이슈 생성에 모두 사용됩니다."
        )

    return OpenAIChatCompletionClient(
        model=model or settings.model_id,
        api_key=settings.github_token,
        base_url=settings.model_base_url,
    )


def build_agent(
    *,
    name: str,
    instructions: str,
    settings: Settings,
    model: str | None = None,
    tools: list[Any] | None = None,
) -> SupportsAgentRun:
    """공급자 설정에 맞는 에이전트 하나를 만든다."""
    provider = settings.model_provider

    if provider == "copilot_sdk":
        try:
            from agent_framework.github import GitHubCopilotAgent
        except ImportError as exc:  # pragma: no cover - 선택 의존성
            raise ModelConfigurationError(
                "MODEL_PROVIDER=copilot_sdk를 쓰려면 "
                "`pip install agent-framework-github-copilot` 후 "
                "`python -m copilot download-runtime`을 실행해야 합니다."
            ) from exc

        return GitHubCopilotAgent(
            instructions,
            name=name,
            tools=tools or None,
        )

    if provider == "azure_openai":
        client = _build_azure_openai_client(settings, model)
    elif provider == "github_models":
        client = _build_github_models_client(settings, model)
    else:
        raise ModelConfigurationError(
            f"알 수 없는 MODEL_PROVIDER: {provider!r} "
            "(azure_openai, copilot_sdk, github_models 중 하나여야 합니다)"
        )

    return Agent(
        client=client,
        instructions=instructions,
        name=name,
        tools=tools or None,
    )
