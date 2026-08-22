"""테스트용 가짜 에이전트 — 네트워크 없이 파이프라인 전체를 돌린다."""

from __future__ import annotations

import json
from typing import Any

from agent_framework import (
    Agent,
    BaseChatClient,
    ChatResponse,
    ChatResponseUpdate,
    Content,
    Message,
    ResponseStream,
)


class ScriptedChatClient(BaseChatClient):
    """미리 정한 JSON 응답을 순서대로 돌려주는 클라이언트.

    ``failures``만큼 먼저 예외를 던지게 해 재시도 경로도 시험할 수 있다.
    """

    def __init__(self, payloads: list[str], *, failures: int = 0) -> None:
        super().__init__()
        self._payloads = list(payloads)
        self._calls = 0
        self._remaining_failures = failures

    @property
    def call_count(self) -> int:
        return self._calls

    def _next_payload(self) -> str:
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            raise RuntimeError("모의 공급자 오류")
        if not self._payloads:
            raise AssertionError("스크립트에 남은 응답이 없습니다.")
        return self._payloads.pop(0)

    def _inner_get_response(
        self, *, messages: Any, stream: bool, options: Any, **kwargs: Any
    ):
        self._calls += 1

        if stream:
            payload = self._next_payload()

            async def gen():
                chunk = 24
                for i in range(0, len(payload), chunk):
                    yield ChatResponseUpdate(
                        contents=[Content.from_text(payload[i : i + chunk])],
                        role="assistant",
                    )

            return ResponseStream(gen(), finalizer=ChatResponse.from_updates)

        async def once() -> ChatResponse:
            payload = self._next_payload()
            return ChatResponse(
                messages=[Message("assistant", [Content.from_text(payload)])]
            )

        return once()


def scripted_agent(name: str, payloads: list[dict | str], *, failures: int = 0) -> Agent:
    serialized = [
        p if isinstance(p, str) else json.dumps(p, ensure_ascii=False) for p in payloads
    ]
    return Agent(
        client=ScriptedChatClient(serialized, failures=failures),
        instructions=f"{name} 테스트 지침",
        name=name,
    )
