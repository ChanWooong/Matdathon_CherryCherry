"""API 계층 테스트 — SSE 스트리밍, 승인 게이트, 이슈 생성 부분 실패."""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from tests.fakes import scripted_agent
from tests.test_pipeline import COMPOSITION, EXTRACTION, REVIEW


@pytest.fixture
def settings(tmp_path):
    return Settings(
        github_token="test-token",
        history_db_path=str(tmp_path / "history.db"),
        max_retries=0,
        environment="test",
    )


@pytest.fixture
def client(settings, monkeypatch):
    # 파이프라인이 실제 모델을 부르지 않도록 가짜 에이전트를 주입한다.
    import app.api.routes as routes
    from app.agents import pipeline as pipeline_module

    real_build = pipeline_module.build_workflow

    def fake_build(cfg, *, agents=None):
        return real_build(
            cfg,
            agents=agents
            or {
                "extractor": scripted_agent("extractor", [EXTRACTION]),
                "composer": scripted_agent("composer", [COMPOSITION]),
                "reviewer": scripted_agent("reviewer", [REVIEW]),
            },
        )

    monkeypatch.setattr(routes, "build_workflow", fake_build)

    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as c:
        yield c


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    """SSE 본문을 (이벤트명, payload) 목록으로 되돌린다."""
    events: list[tuple[str, dict]] = []
    for frame in body.split("\n\n"):
        name, data = None, []
        for line in frame.splitlines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                data.append(line[6:])
        if name and data:
            events.append((name, json.loads("\n".join(data))))
    return events


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@respx.mock
def test_analyze_streams_stages_and_result(client):
    respx.get("https://api.github.com/repos/acme/web/labels").mock(
        return_value=httpx.Response(200, json=[{"name": "bug", "color": "d73a4a"}])
    )
    respx.get("https://api.github.com/repos/acme/web/assignees").mock(
        return_value=httpx.Response(200, json=[{"login": "chanwoong"}])
    )

    response = client.post(
        "/api/analyze",
        json={"transcript": "찬웅님이 결제 타임아웃을 5초로 낮춰주세요.", "repo": "acme/web"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(response.text)
    names = [n for n, _ in events]

    assert names[0] == "start"
    assert names[-1] == "done"
    assert "stage" in names and "delta" in names and "result" in names
    assert "error" not in names

    result = next(payload for name, payload in events if name == "result")
    assert result["summary"] == "결제 지연 이슈를 논의했다."
    assert len(result["drafts"]) == 1
    assert result["drafts"][0]["labels"] == ["bug"]
    assert result["findings"][0]["kind"] == "missing_due"


@respx.mock
def test_analyze_survives_repo_context_failure(client):
    # 라벨 조회가 실패해도 분석은 계속되어야 한다.
    respx.get("https://api.github.com/repos/acme/web/labels").mock(
        return_value=httpx.Response(404, json={"message": "Not Found"})
    )
    respx.get("https://api.github.com/repos/acme/web/assignees").mock(
        return_value=httpx.Response(404, json={"message": "Not Found"})
    )

    response = client.post(
        "/api/analyze", json={"transcript": "할 일 하나 있습니다.", "repo": "acme/web"}
    )
    names = [n for n, _ in _parse_sse(response.text)]
    assert "result" in names
    assert "error" not in names


def test_analyze_rejects_empty_transcript(client):
    response = client.post("/api/analyze", json={"transcript": "   "})
    assert response.status_code == 422


def test_analyze_rejects_bad_repo_format(client):
    response = client.post(
        "/api/analyze", json={"transcript": "내용", "repo": "not-a-repo"}
    )
    assert response.status_code == 422


@respx.mock
def test_analyze_accepts_github_repo_url(client):
    respx.get("https://api.github.com/repos/acme/web/labels").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get("https://api.github.com/repos/acme/web/assignees").mock(
        return_value=httpx.Response(200, json=[])
    )

    response = client.post(
        "/api/analyze",
        json={
            "transcript": "내용",
            "repo": "https://github.com/acme/web/issues/12",
        },
    )
    assert response.status_code == 200


def _draft(draft_id="draft-1", title="테스트 이슈"):
    return {
        "draft_id": draft_id,
        "title": title,
        "body": "## 배경\n내용",
        "acceptance_criteria": [{"id": "AC1", "text": "검증 가능한 조건"}],
        "labels": [],
        "assignees": [],
        "evidence": "원문 인용",
    }


def test_create_issues_requires_approval(client):
    """책임 있는 AI: 승인 없이는 절대 생성되면 안 된다."""
    response = client.post(
        "/api/issues",
        json={"repo": "acme/web", "drafts": [_draft()], "approved": False},
    )
    assert response.status_code == 400
    assert "승인" in response.json()["detail"]


def test_approval_gate_precedes_token_check(tmp_path, monkeypatch):
    """토큰이 없어도 거부 사유는 '승인 없음'이어야 한다.

    승인 검사가 GitHub 클라이언트 생성보다 뒤에 있으면 401이 먼저 나와
    사용자가 진짜 이유를 알 수 없다.
    """
    tokenless = Settings(
        github_token="",
        history_db_path=str(tmp_path / "h.db"),
        environment="test",
    )
    app = create_app(tokenless)
    app.dependency_overrides[get_settings] = lambda: tokenless

    with TestClient(app) as c:
        response = c.post(
            "/api/issues",
            json={"repo": "acme/web", "drafts": [_draft()], "approved": False},
        )

    assert response.status_code == 400
    assert "승인" in response.json()["detail"]


@respx.mock
def test_create_issues_reports_partial_failure(client):
    route = respx.post("https://api.github.com/repos/acme/web/issues")
    route.side_effect = [
        httpx.Response(
            201,
            json={"number": 12, "html_url": "https://github.com/acme/web/issues/12"},
        ),
        httpx.Response(422, json={"message": "Validation Failed"}),
        httpx.Response(422, json={"message": "Validation Failed"}),
    ]

    response = client.post(
        "/api/issues",
        json={
            "repo": "acme/web",
            "drafts": [_draft("draft-1"), _draft("draft-2", "실패할 이슈")],
            "approved": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["succeeded_count"] == 1
    assert body["failed_count"] == 1

    outcomes = {o["draft_id"]: o for o in body["results"]}
    assert outcomes["draft-1"]["ok"] is True
    assert outcomes["draft-1"]["number"] == 12
    assert outcomes["draft-2"]["ok"] is False
    assert "Validation Failed" in outcomes["draft-2"]["error"]


@respx.mock
def test_create_issues_appends_ai_notice_and_ac(client):
    captured = {}

    def capture(request):
        captured.update(json.loads(request.content))
        return httpx.Response(
            201, json={"number": 1, "html_url": "https://github.com/acme/web/issues/1"}
        )

    respx.post("https://api.github.com/repos/acme/web/issues").mock(side_effect=capture)

    client.post(
        "/api/issues",
        json={"repo": "acme/web", "drafts": [_draft()], "approved": True},
    )

    body = captured["body"]
    assert "🤖 AI가 생성한 초안입니다" in body
    assert "- [ ] `AC1` 검증 가능한 조건" in body
    assert "원문 인용" in body


@respx.mock
def test_history_records_analysis_without_transcript(client):
    respx.get("https://api.github.com/repos/acme/web/labels").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get("https://api.github.com/repos/acme/web/assignees").mock(
        return_value=httpx.Response(200, json=[])
    )

    client.post(
        "/api/analyze",
        json={
            "transcript": "비밀스러운 회의 내용",
            "repo": "acme/web",
            "meeting_title": "주간회의",
        },
    )

    items = client.get("/api/history").json()
    assert len(items) == 1
    assert items[0]["meeting_title"] == "주간회의"

    detail = client.get(f"/api/history/{items[0]['analysis_id']}").json()
    # 개인정보 기본값: 원문은 저장되지 않아야 한다.
    assert detail["transcript"] is None
    assert detail["transcript_stored"] is False
    assert detail["summary"]


# --------------------------------------------------------------------------
# 스트림 조기 종료 (클라이언트 연결 끊김)
# --------------------------------------------------------------------------


@respx.mock
async def test_stream_close_midway_does_not_raise(settings, monkeypatch):
    """클라이언트가 도중에 끊어도 GeneratorExit가 무시되지 않아야 한다.

    `finally`에서 done 프레임을 yield하면 여기서
    RuntimeError: async generator ignored GeneratorExit 가 난다.
    TestClient는 항상 스트림을 끝까지 읽어버려 이 경로를 못 잡으므로,
    제너레이터를 직접 닫아서 검증한다.
    """
    import app.api.routes as routes
    from app.agents import pipeline as pipeline_module
    from app.schemas import AnalyzeRequest
    from app.services.history import HistoryStore

    respx.get("https://api.github.com/repos/acme/web/labels").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get("https://api.github.com/repos/acme/web/assignees").mock(
        return_value=httpx.Response(200, json=[])
    )

    real_build = pipeline_module.build_workflow
    monkeypatch.setattr(
        routes,
        "build_workflow",
        lambda cfg, *, agents=None: real_build(
            cfg,
            agents={
                "extractor": scripted_agent("extractor", [EXTRACTION]),
                "composer": scripted_agent("composer", [COMPOSITION]),
                "reviewer": scripted_agent("reviewer", [REVIEW]),
            },
        ),
    )

    class _NeverDisconnected:
        async def is_disconnected(self) -> bool:
            return False

    stream = routes._analysis_stream(
        AnalyzeRequest(transcript="회의 원문입니다.", repo="acme/web"),
        settings,
        HistoryStore(settings.history_db_path),
        _NeverDisconnected(),
    )

    first = await anext(stream)
    assert "start" in first

    # 파이프라인이 도는 중(try 블록 안)까지 진행시킨다.
    # 여기서 닫혀야 GeneratorExit가 finally를 통과한다.
    async for frame in stream:
        if "event: stage" in frame:
            break
    else:  # pragma: no cover - 스테이지 이벤트는 항상 나온다
        pytest.fail("stage 이벤트가 나오지 않아 스트림 중단을 검증할 수 없습니다.")

    # 클라이언트 연결이 끊기면 Starlette가 제너레이터를 닫는다.
    await stream.aclose()


# --------------------------------------------------------------------------
# 접근 제어 (X-API-Key)
# --------------------------------------------------------------------------


def _client_with(settings) -> TestClient:
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def test_api_key_missing_is_rejected(tmp_path):
    settings = Settings(
        github_token="test-token",
        history_db_path=str(tmp_path / "h.db"),
        environment="dev",
        api_key="s3cret",
    )
    with _client_with(settings) as client:
        assert client.get("/api/history").status_code == 401
        assert client.get("/health").status_code == 200  # 헬스체크는 열려 있어야 한다


def test_api_key_match_is_accepted(tmp_path):
    settings = Settings(
        github_token="test-token",
        history_db_path=str(tmp_path / "h.db"),
        environment="dev",
        api_key="s3cret",
    )
    with _client_with(settings) as client:
        res = client.get("/api/history", headers={"X-API-Key": "s3cret"})
        assert res.status_code == 200


def test_production_without_api_key_is_locked(tmp_path):
    """운영 환경에서 키를 깜빡했다면 열린 채로 뜨는 대신 잠겨야 한다."""
    settings = Settings(
        github_token="test-token",
        history_db_path=str(tmp_path / "h.db"),
        environment="prod",
        api_key="",
    )
    with _client_with(settings) as client:
        assert client.get("/api/history").status_code == 503
