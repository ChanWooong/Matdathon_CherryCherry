"""모델 공급자 선택 로직 테스트.

GitHub Models가 2026-07-30 폐지되면서 기본 공급자가 azure_openai로 바뀌었다.
설정 오류가 런타임 깊은 곳이 아니라 초기화 시점에 드러나는지 확인한다.
"""

from __future__ import annotations

import pytest

from app.agents.chat_client import ModelConfigurationError, build_agent
from app.core.config import Settings


def _agent(**overrides):
    return build_agent(
        name="extractor",
        instructions="테스트용 지시문",
        settings=Settings(**overrides),
    )


def test_default_provider_is_azure_openai():
    assert Settings().model_provider == "azure_openai"


def test_unknown_provider_is_rejected_at_settings_level():
    with pytest.raises(ValueError, match="MODEL_PROVIDER"):
        Settings(model_provider="ollama")


def test_azure_without_endpoint_fails_fast():
    with pytest.raises(ModelConfigurationError, match="AZURE_OPENAI_ENDPOINT"):
        _agent(model_provider="azure_openai", azure_openai_endpoint="")


def test_azure_with_api_key_builds_agent():
    agent = _agent(
        model_provider="azure_openai",
        azure_openai_endpoint="https://example.openai.azure.com/",
        azure_openai_api_key="test-key",
        model_id="gpt-4o",
    )
    assert agent.name == "extractor"


def test_azure_client_targets_the_deployment_url():
    """MODEL_ID는 모델명이 아니라 '배포 이름'으로 URL에 박혀야 한다."""
    from app.agents.chat_client import _build_azure_openai_client

    client = _build_azure_openai_client(
        Settings(
            model_provider="azure_openai",
            azure_openai_endpoint="https://example.openai.azure.com/",
            azure_openai_api_key="test-key",
            model_id="my-deployment",
            azure_openai_api_version="2024-10-21",
        )
    )
    inner = client.client
    assert type(inner).__name__ == "AsyncAzureOpenAI"
    assert "example.openai.azure.com" in str(inner.base_url)
    assert "deployments/my-deployment" in str(inner.base_url)


def test_retired_github_models_warns(caplog):
    """폐지된 공급자를 고르면 조용히 실패하지 말고 이유를 알려줘야 한다."""
    with caplog.at_level("WARNING"):
        _agent(model_provider="github_models", github_token="t")
    assert any("폐지" in r.message for r in caplog.records)
