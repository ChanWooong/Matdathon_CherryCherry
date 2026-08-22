"""GitHub REST API 클라이언트.

httpx만 사용해 리포 조회 / 라벨 조회 / 이슈 일괄 생성을 처리한다.
이슈 생성은 **부분 실패**를 허용하고, 성공/실패를 초안 단위로 구분해 돌려준다.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import Settings
from app.schemas import (
    CreateIssuesResponse,
    GitHubIssueSummary,
    GitHubPullRequestDetail,
    GitHubPullRequestSummary,
    GitHubUserSummary,
    IssueCreationOutcome,
    IssueDraft,
    LabelSummary,
    RepoSummary,
)

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


class GitHubError(RuntimeError):
    """GitHub 호출 실패. status를 함께 보존해 라우터에서 매핑한다."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def _explain(response: httpx.Response) -> str:
    """GitHub 오류 응답을 사람이 읽을 수 있는 한 줄로 바꾼다."""
    try:
        payload = response.json()
    except ValueError:
        return f"HTTP {response.status_code}: {response.text[:200]}"

    message = payload.get("message", f"HTTP {response.status_code}")
    errors = payload.get("errors") or []
    details = [
        e.get("message") or f"{e.get('field', '?')}: {e.get('code', '?')}"
        for e in errors
        if isinstance(e, dict)
    ]
    return f"{message} ({'; '.join(details)})" if details else str(message)


def _repo_path(repo: str) -> str:
    """Validate owner/repo and encode each URL path segment independently."""
    parts = repo.split("/")
    if len(parts) != 2 or not all(parts):
        raise GitHubError("repo는 'owner/repo' 형식이어야 합니다.", status=400)
    return "/".join(quote(part, safe="") for part in parts)


def _user_summary(data: dict[str, Any] | None) -> GitHubUserSummary | None:
    if not data:
        return None
    return GitHubUserSummary(
        login=data["login"],
        avatar_url=data.get("avatar_url"),
        html_url=data.get("html_url"),
    )


def _labels(data: list[dict[str, Any]]) -> list[LabelSummary]:
    return [
        LabelSummary(
            name=item["name"],
            color=item.get("color", ""),
            description=item.get("description"),
        )
        for item in data
    ]


class GitHubService:
    """토큰 하나로 동작하는 얇은 GitHub 클라이언트."""

    def __init__(self, token: str, settings: Settings | None = None) -> None:
        if not token:
            raise GitHubError("GitHub 토큰이 설정되지 않았습니다.", status=401)
        self._token = token
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=GITHUB_API,
            timeout=httpx.Timeout(20.0, connect=10.0),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "MeetToIssue/0.1",
            },
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> GitHubService:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    # -- 내부 -------------------------------------------------------------

    async def _get(self, path: str, **params: Any) -> Any:
        try:
            response = await self._client.get(path, params=params or None)
        except httpx.RequestError as exc:
            raise GitHubError(f"GitHub 연결 실패: {exc}") from exc

        if response.status_code >= 400:
            raise GitHubError(_explain(response), status=response.status_code)
        try:
            return response.json()
        except ValueError as exc:
            raise GitHubError("GitHub 응답이 올바른 JSON이 아닙니다.") from exc

    # -- 공개 API ---------------------------------------------------------

    async def verify_token(self) -> str:
        """토큰이 유효한지 확인하고 로그인 아이디를 돌려준다."""
        data = await self._get("/user")
        return data.get("login", "")

    async def list_repos(self, limit: int = 100) -> list[RepoSummary]:
        """사용자가 접근 가능한 리포를 최근 푸시 순으로 반환한다."""
        repos: list[RepoSummary] = []
        page = 1

        while len(repos) < limit:
            per_page = min(100, limit - len(repos))
            batch = await self._get(
                "/user/repos",
                per_page=per_page,
                page=page,
                sort="pushed",
                affiliation="owner,collaborator,organization_member",
            )
            if not batch:
                break

            for item in batch:
                owner = (item.get("owner") or {}).get("login", "")
                repos.append(
                    RepoSummary(
                        id=item["id"],
                        full_name=item["full_name"],
                        name=item["name"],
                        owner=owner,
                        private=item.get("private", False),
                        description=item.get("description"),
                        default_branch=item.get("default_branch") or "main",
                        language=item.get("language"),
                        html_url=item["html_url"],
                        open_issues_count=item.get("open_issues_count", 0),
                        updated_at=item.get("updated_at"),
                        pushed_at=item.get("pushed_at"),
                    )
                )

            if len(batch) < per_page:
                break
            page += 1

        return repos[:limit]

    async def list_labels(self, repo: str) -> list[LabelSummary]:
        """리포에 실제로 존재하는 라벨 목록.

        정리 에이전트가 없는 라벨을 지어내지 않도록 컨텍스트로 넘긴다.
        """
        data = await self._get(f"/repos/{_repo_path(repo)}/labels", per_page=100)
        return _labels(data)

    async def list_assignable_users(self, repo: str) -> list[str]:
        """이슈에 할당 가능한 사용자 로그인 목록."""
        try:
            data = await self._get(f"/repos/{_repo_path(repo)}/assignees", per_page=100)
        except GitHubError as exc:
            logger.info("담당자 목록 조회 실패 (%s) — 담당자 검증을 건너뜁니다.", exc)
            return []
        return [item["login"] for item in data]

    async def list_open_issues(
        self,
        repo: str,
        *,
        limit: int = 30,
    ) -> list[GitHubIssueSummary]:
        """Return open issues only; GitHub's issues API also returns PRs."""
        issues: list[GitHubIssueSummary] = []
        per_page = min(max(limit, 1), 100)
        page = 1
        while len(issues) < limit:
            data = await self._get(
                f"/repos/{_repo_path(repo)}/issues",
                state="open",
                sort="updated",
                direction="desc",
                per_page=per_page,
                page=page,
            )
            issues.extend(
                GitHubIssueSummary(
                    number=item["number"],
                    title=item["title"],
                    state=item["state"],
                    html_url=item["html_url"],
                    body=item.get("body"),
                    user=_user_summary(item.get("user")),
                    labels=_labels(item.get("labels") or []),
                    assignees=[
                        user
                        for assignee in item.get("assignees") or []
                        if (user := _user_summary(assignee)) is not None
                    ],
                    comments=item.get("comments", 0),
                    created_at=item["created_at"],
                    updated_at=item["updated_at"],
                )
                for item in data
                if "pull_request" not in item
            )
            if len(data) < per_page:
                break
            page += 1
        return issues[:limit]

    async def list_open_pull_requests(
        self,
        repo: str,
        *,
        limit: int = 30,
    ) -> list[GitHubPullRequestSummary]:
        data = await self._get(
            f"/repos/{_repo_path(repo)}/pulls",
            state="open",
            sort="updated",
            direction="desc",
            per_page=min(max(limit, 1), 100),
        )
        return [self._pull_summary(item) for item in data]

    @staticmethod
    def _pull_summary(item: dict[str, Any]) -> GitHubPullRequestSummary:
        return GitHubPullRequestSummary(
            number=item["number"],
            title=item["title"],
            state=item["state"],
            html_url=item["html_url"],
            draft=item.get("draft", False),
            user=_user_summary(item.get("user")),
            head_ref=item["head"]["ref"],
            base_ref=item["base"]["ref"],
            created_at=item["created_at"],
            updated_at=item["updated_at"],
        )

    async def get_pull_request(
        self,
        repo: str,
        pull_number: int,
    ) -> GitHubPullRequestDetail:
        item = await self._get(f"/repos/{_repo_path(repo)}/pulls/{pull_number}")
        summary = self._pull_summary(item)
        return GitHubPullRequestDetail(
            **summary.model_dump(),
            body=item.get("body"),
            merged=item.get("merged", False),
            mergeable=item.get("mergeable"),
            additions=item.get("additions", 0),
            deletions=item.get("deletions", 0),
            changed_files=item.get("changed_files", 0),
            commits=item.get("commits", 0),
            comments=item.get("comments", 0),
            review_comments=item.get("review_comments", 0),
            diff_url=item.get("diff_url"),
            patch_url=item.get("patch_url"),
        )

    async def get_pull_diff(self, repo: str, pull_number: int) -> str:
        try:
            response = await self._client.get(
                f"/repos/{_repo_path(repo)}/pulls/{pull_number}",
                headers={"Accept": "application/vnd.github.v3.diff"},
            )
        except httpx.RequestError as exc:
            raise GitHubError(f"GitHub 연결 실패: {exc}") from exc
        if response.status_code >= 400:
            raise GitHubError(_explain(response), status=response.status_code)
        return response.text

    async def create_issue(self, repo: str, draft: IssueDraft) -> IssueCreationOutcome:
        """초안 하나를 이슈로 만든다. 실패해도 예외를 던지지 않는다."""
        payload: dict[str, Any] = {
            "title": draft.title,
            "body": draft.to_github_body(),
        }
        if draft.labels:
            payload["labels"] = draft.labels
        if draft.assignees:
            payload["assignees"] = draft.assignees

        path = f"/repos/{_repo_path(repo)}/issues"
        try:
            response = await self._client.post(path, json=payload)
        except httpx.RequestError as exc:
            return IssueCreationOutcome(
                draft_id=draft.draft_id,
                title=draft.title,
                ok=False,
                error=f"네트워크 오류: {exc}",
            )

        if response.status_code >= 400:
            reason = _explain(response)

            # 존재하지 않는 라벨/담당자 때문에 실패한 경우,
            # 해당 필드를 빼고 한 번 더 시도해 이슈 자체는 살린다.
            if response.status_code in (403, 404, 422) and (
                draft.labels or draft.assignees
            ):
                retry = await self._client.post(
                    path,
                    json={"title": payload["title"], "body": payload["body"]},
                )
                if retry.status_code < 400:
                    created = retry.json()
                    logger.warning(
                        "라벨/담당자 없이 재시도해 이슈 #%s를 생성했습니다 (원인: %s)",
                        created.get("number"),
                        reason,
                    )
                    return IssueCreationOutcome(
                        draft_id=draft.draft_id,
                        title=draft.title,
                        ok=True,
                        number=created.get("number"),
                        url=created.get("html_url"),
                        error=f"라벨/담당자는 적용하지 못했습니다: {reason}",
                    )

            return IssueCreationOutcome(
                draft_id=draft.draft_id,
                title=draft.title,
                ok=False,
                error=reason,
            )

        created = response.json()
        return IssueCreationOutcome(
            draft_id=draft.draft_id,
            title=draft.title,
            ok=True,
            number=created.get("number"),
            url=created.get("html_url"),
        )

    async def create_issues(
        self, repo: str, drafts: list[IssueDraft], concurrency: int = 3
    ) -> CreateIssuesResponse:
        """초안 여러 개를 제한된 동시성으로 생성한다.

        GitHub의 secondary rate limit을 피하려고 동시 실행 수를 낮게 잡는다.
        하나가 실패해도 나머지는 계속 진행한다.
        """
        semaphore = asyncio.Semaphore(max(1, concurrency))

        async def run(draft: IssueDraft) -> IssueCreationOutcome:
            async with semaphore:
                return await self.create_issue(repo, draft)

        results = await asyncio.gather(
            *(run(d) for d in drafts), return_exceptions=True
        )

        outcomes: list[IssueCreationOutcome] = []
        for draft, result in zip(drafts, results, strict=True):
            if isinstance(result, BaseException):
                logger.exception("이슈 생성 중 예기치 못한 오류", exc_info=result)
                outcomes.append(
                    IssueCreationOutcome(
                        draft_id=draft.draft_id,
                        title=draft.title,
                        ok=False,
                        error=f"예기치 못한 오류: {result}",
                    )
                )
            else:
                outcomes.append(result)

        succeeded = sum(1 for o in outcomes if o.ok)
        return CreateIssuesResponse(
            repo=repo,
            results=outcomes,
            succeeded_count=succeeded,
            failed_count=len(outcomes) - succeeded,
        )
