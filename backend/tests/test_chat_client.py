"""Copilot SDK / Azure OpenAI 공급자 선택 로직 테스트."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from app.agents.chat_client import ModelConfigurationError, build_agent
from app.core.config import Settings


def _agent(**overrides):
    return build_agent(
        name="extractor",
        instructions="테스트용 지시문",
        settings=Settings(**overrides),
    )


def test_default_provider_is_copilot_sdk():
    assert Settings().model_provider == "copilot_sdk"


def test_copilot_sdk_builds_agent_with_framework_tools(monkeypatch):
    created: dict = {}

    class FakeCopilotAgent:
        def __init__(self, instructions, **kwargs):
            created.update(instructions=instructions, **kwargs)

    monkeypatch.setitem(
        sys.modules,
        "agent_framework.github",
        SimpleNamespace(GitHubCopilotAgent=FakeCopilotAgent),
    )
    tool = lambda: "repository policy"  # noqa: E731

    agent = build_agent(
        name="composer",
        instructions="compose issues",
        settings=Settings(model_provider="copilot_sdk", model_id="gpt-5-mini"),
        tools=[tool],
    )

    assert isinstance(agent, FakeCopilotAgent)
    assert created == {
        "instructions": "compose issues",
        "name": "composer",
        "tools": [tool],
        "default_options": {"model": "gpt-5-mini"},
    }


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


def test_retired_github_models_is_rejected():
    with pytest.raises(ValueError, match="MODEL_PROVIDER"):
        Settings(model_provider="github_models")


def test_production_requires_azure_openai_provider():
    with pytest.raises(ValueError, match="ENVIRONMENT=prod.*azure_openai"):
        Settings(environment="prod", model_provider="copilot_sdk")


def test_production_azure_requires_endpoint():
    with pytest.raises(ValueError, match="AZURE_OPENAI_ENDPOINT"):
        Settings(
            environment="prod",
            model_provider="azure_openai",
            azure_openai_endpoint="",
        )
