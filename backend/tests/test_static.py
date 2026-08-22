from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_spa_is_optional_when_assets_are_absent(tmp_path):
    client = TestClient(create_app(Settings(), static_dir=tmp_path))

    assert client.get("/").status_code == 404
    assert client.get("/health").status_code == 200


def test_spa_serves_assets_and_client_routes_without_shadowing_api(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<main>SPA shell</main>", encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("console.log('ready')", encoding="utf-8")
    client = TestClient(create_app(Settings(), static_dir=tmp_path))

    assert client.get("/projects/123").text == "<main>SPA shell</main>"
    assert client.get("/assets/app.js").text == "console.log('ready')"
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/docs").status_code == 200
    assert client.get("/api/not-a-route").status_code == 404
