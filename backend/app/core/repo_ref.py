"""GitHub repo 식별자(owner/repo) 정규화 유틸."""

from __future__ import annotations

from urllib.parse import urlparse


def normalize_repo_ref(value: str) -> str:
    """owner/repo 또는 github.com URL을 owner/repo로 정규화한다."""
    raw = value.strip()
    if not raw:
        raise ValueError(
            "레포지토리는 'owner/repo' 또는 'https://github.com/owner/repo' 형식이어야 합니다."
        )

    if raw.startswith("git@github.com:"):
        path = raw.split(":", 1)[1]
        return _from_path(path)

    if "://" in raw:
        parsed = urlparse(raw)
        host = parsed.netloc.lower()
        if host not in {"github.com", "www.github.com"}:
            raise ValueError("GitHub 링크만 지원합니다. (github.com)")
        return _from_path(parsed.path)

    return _from_path(raw)


def _from_path(value: str) -> str:
    text = value.strip("/")
    parts = [part for part in text.split("/") if part]
    if len(parts) < 2:
        raise ValueError(
            "레포지토리는 'owner/repo' 또는 'https://github.com/owner/repo' 형식이어야 합니다."
        )
    owner = parts[0].strip()
    repo = parts[1].strip()
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not owner or not repo:
        raise ValueError(
            "레포지토리는 'owner/repo' 또는 'https://github.com/owner/repo' 형식이어야 합니다."
        )
    return f"{owner}/{repo}"
