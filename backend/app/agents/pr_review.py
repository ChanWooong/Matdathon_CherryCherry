"""Read-only, structured AI review for a GitHub pull request."""

from __future__ import annotations

import json
import re

from agent_framework import SupportsAgentRun
from pydantic import ValidationError

from app.agents.chat_client import build_agent
from app.agents.prompts import PR_REVIEW_PROMPT
from app.core.config import Settings
from app.schemas import (
    GitHubPullRequestDetail,
    PullRequestReviewModelOutput,
    PullRequestReviewResponse,
)

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class PullRequestReviewGenerationError(RuntimeError):
    """The model did not return the required structured review."""


class PullRequestReviewer:
    def __init__(
        self,
        settings: Settings,
        *,
        agent: SupportsAgentRun | None = None,
    ) -> None:
        self._settings = settings
        self._agent = agent or build_agent(
            name="pull-request-reviewer",
            instructions=PR_REVIEW_PROMPT,
            settings=settings,
        )

    @staticmethod
    def _prompt(pull: GitHubPullRequestDetail, diff: str) -> str:
        safe_diff = diff.replace("<<<END_PR_DIFF", "<<<end_pr_diff")
        metadata = json.dumps(pull.model_dump(mode="json"), ensure_ascii=False, indent=2)
        return (
            "다음 Pull Request 메타데이터와 unified diff를 검토하라.\n\n"
            f"PR 메타데이터:\n```json\n{metadata}\n```\n\n"
            "<<<BEGIN_PR_DIFF\n"
            f"{safe_diff}\n"
            "<<<END_PR_DIFF\n\n"
            "코드를 변경하거나 GitHub에 게시하지 말고 구조화된 리뷰만 반환하라."
        )

    async def review(
        self,
        repo: str,
        pull: GitHubPullRequestDetail,
        diff: str,
    ) -> PullRequestReviewResponse:
        maximum = self._settings.pr_review_max_diff_chars
        if len(diff) > maximum:
            diff = (
                diff[:maximum]
                + f"\n\n[diff truncated by server after {maximum} characters]"
            )

        run_options = None
        if self._settings.model_provider != "copilot_sdk":
            run_options = {"response_format": PullRequestReviewModelOutput}

        stream = self._agent.run(
            self._prompt(pull, diff),
            stream=True,
            options=run_options,
        )
        async for _update in stream:
            pass
        response = await stream.get_final_response()

        parsed = getattr(response, "value", None)
        if not isinstance(parsed, PullRequestReviewModelOutput):
            text = _FENCE.sub("", response.text).strip()
            try:
                parsed = PullRequestReviewModelOutput.model_validate_json(text)
            except ValidationError:
                start, end = text.find("{"), text.rfind("}")
                if start == -1 or end <= start:
                    raise PullRequestReviewGenerationError(
                        "모델이 유효한 PR 리뷰 JSON을 반환하지 않았습니다."
                    ) from None
                try:
                    parsed = PullRequestReviewModelOutput.model_validate_json(
                        text[start : end + 1]
                    )
                except ValidationError as exc:
                    raise PullRequestReviewGenerationError(
                        "모델의 PR 리뷰가 응답 스키마와 일치하지 않습니다."
                    ) from exc

        return PullRequestReviewResponse(
            **parsed.model_dump(),
            repo=repo,
            pull_number=pull.number,
            posted_to_github=False,
        )
