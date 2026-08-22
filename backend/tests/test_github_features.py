"""Network-free tests for GitHub read APIs and AI PR review."""

from __future__ import annotations

import httpx
import respx
from fastapi.testclient import TestClient

from app.agents.pr_review import PullRequestReviewer
from app.api.github_routes import get_pr_reviewer
from app.core.config import Settings, get_settings
from app.main import create_app
from app.services.github import _repo_path
from tests.fakes import scripted_agent

NOW = "2026-08-22T05:00:00Z"


def test_repo_path_encodes_segments_independently():
    assert _repo_path("acme org/web#api") == "acme%20org/web%23api"
    assert (
        _repo_path("https://github.com/acme-org/web-app/issues/1")
        == "acme-org/web-app"
    )


def _settings(tmp_path, **overrides) -> Settings:
    defaults = {
        "github_token": "server-token",
        "history_db_path": str(tmp_path / "history.db"),
        "environment": "test",
        "model_provider": "azure_openai",
    }
    return Settings(**{**defaults, **overrides})


def _client(settings: Settings) -> TestClient:
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def _issue(number: int = 1) -> dict:
    return {
        "number": number,
        "title": "Fix checkout",
        "state": "open",
        "html_url": f"https://github.com/acme/web/issues/{number}",
        "body": "Details",
        "user": {"login": "octocat"},
        "labels": [{"name": "bug", "color": "d73a4a"}],
        "assignees": [{"login": "hubot"}],
        "comments": 2,
        "created_at": NOW,
        "updated_at": NOW,
    }


def _pull(number: int = 7) -> dict:
    return {
        "number": number,
        "title": "Improve checkout",
        "state": "open",
        "html_url": f"https://github.com/acme/web/pull/{number}",
        "draft": False,
        "body": "PR body",
        "user": {"login": "octocat"},
        "head": {"ref": "feature/checkout"},
        "base": {"ref": "main"},
        "created_at": NOW,
        "updated_at": NOW,
        "merged": False,
        "mergeable": True,
        "additions": 20,
        "deletions": 3,
        "changed_files": 2,
        "commits": 1,
        "comments": 1,
        "review_comments": 2,
        "diff_url": f"https://github.com/acme/web/pull/{number}.diff",
        "patch_url": f"https://github.com/acme/web/pull/{number}.patch",
    }


@respx.mock
def test_repo_summary_includes_stable_id_and_ui_metadata(tmp_path):
    respx.get("https://api.github.com/user/repos").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": 12_345,
                    "full_name": "acme/web",
                    "name": "web",
                    "owner": {"login": "acme"},
                    "private": True,
                    "description": "Web application",
                    "default_branch": "main",
                    "language": "TypeScript",
                    "html_url": "https://github.com/acme/web",
                    "open_issues_count": 8,
                    "updated_at": NOW,
                    "pushed_at": NOW,
                }
            ],
        )
    )

    with _client(_settings(tmp_path)) as client:
        response = client.get("/api/repos")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 12_345,
            "full_name": "acme/web",
            "name": "web",
            "owner": "acme",
            "private": True,
            "description": "Web application",
            "default_branch": "main",
            "language": "TypeScript",
            "html_url": "https://github.com/acme/web",
            "open_issues_count": 8,
            "updated_at": "2026-08-22T05:00:00Z",
            "pushed_at": "2026-08-22T05:00:00Z",
        }
    ]


@respx.mock
def test_resolves_repository_from_github_link(tmp_path):
    respx.get("https://api.github.com/repos/acme/web").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": 12_345,
                "full_name": "acme/web",
                "name": "web",
                "owner": {"login": "acme"},
                "private": False,
                "description": "Web application",
                "default_branch": "main",
                "language": "TypeScript",
                "html_url": "https://github.com/acme/web",
                "open_issues_count": 8,
                "updated_at": NOW,
                "pushed_at": NOW,
            },
        )
    )

    with _client(_settings(tmp_path)) as client:
        response = client.get("/api/repos/resolve?q=https://github.com/acme/web")

    assert response.status_code == 200
    assert response.json()["full_name"] == "acme/web"


@respx.mock
def test_lists_open_issues_and_filters_pull_requests(tmp_path):
    route = respx.get("https://api.github.com/repos/acme/web/issues").mock(
        return_value=httpx.Response(
            200,
            json=[
                _issue(),
                {**_issue(2), "pull_request": {"url": "https://api.github.com/pulls/2"}},
            ],
        )
    )
    settings = _settings(tmp_path)

    with _client(settings) as client:
        response = client.get("/api/repos/acme/web/issues?limit=20")

    assert response.status_code == 200
    assert [item["number"] for item in response.json()] == [1]
    request = route.calls.last.request
    assert request.url.params["state"] == "open"
    assert request.url.params["per_page"] == "20"
    assert request.headers["Authorization"] == "Bearer server-token"


@respx.mock
def test_lists_open_pull_requests_with_server_token(tmp_path):
    route = respx.get("https://api.github.com/repos/acme/web/pulls").mock(
        return_value=httpx.Response(200, json=[_pull()])
    )

    with _client(_settings(tmp_path)) as client:
        response = client.get("/api/repos/acme/web/pulls")

    assert response.status_code == 200
    assert response.json()[0]["head_ref"] == "feature/checkout"
    assert route.calls.last.request.headers["Authorization"] == "Bearer server-token"


@respx.mock
def test_returns_typed_pull_request_detail(tmp_path):
    respx.get("https://api.github.com/repos/acme/web/pulls/7").mock(
        return_value=httpx.Response(200, json=_pull())
    )

    with _client(_settings(tmp_path)) as client:
        response = client.get("/api/repos/acme/web/pulls/7")

    assert response.status_code == 200
    assert response.json()["changed_files"] == 2
    assert response.json()["mergeable"] is True
    assert response.json()["base_ref"] == "main"


def test_new_github_routes_remain_covered_by_api_key(tmp_path):
    with _client(_settings(tmp_path, api_key="secret")) as client:
        assert client.get("/api/repos/acme/web/issues").status_code == 401


def test_pr_review_reports_missing_model_configuration_before_github_call(tmp_path):
    with _client(_settings(tmp_path, azure_openai_endpoint="")) as client:
        response = client.post("/api/repos/acme/web/pulls/7/review")

    assert response.status_code == 503
    assert "AZURE_OPENAI_ENDPOINT" in response.json()["detail"]


@respx.mock
def test_pr_review_returns_fake_structured_result_and_never_posts(tmp_path):
    github_route = respx.get("https://api.github.com/repos/acme/web/pulls/7")
    github_route.side_effect = [
        httpx.Response(200, json=_pull()),
        httpx.Response(200, text="diff --git a/app.py b/app.py\n+print('ok')"),
    ]
    output = {
        "verdict": "comment",
        "summary": "한 가지 확인 사항이 있습니다.",
        "findings": [
            {
                "severity": "warning",
                "title": "출력문 확인",
                "message": "디버그 출력이 추가됐습니다.",
                "suggestion": "필요하지 않다면 제거하세요.",
                "file": "app.py",
                "line": 1,
            }
        ],
    }
    settings = _settings(tmp_path)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_pr_reviewer] = lambda: PullRequestReviewer(
        settings,
        agent=scripted_agent("pr-reviewer", [output]),
    )

    with TestClient(app) as client:
        response = client.post("/api/repos/acme/web/pulls/7/review")

    assert response.status_code == 200
    body = response.json()
    assert body["repo"] == "acme/web"
    assert body["pull_number"] == 7
    assert body["posted_to_github"] is False
    assert body["findings"][0]["file"] == "app.py"
    assert len(github_route.calls) == 2
