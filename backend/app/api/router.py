from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/repos")
async def list_repos() -> list[dict[str, str]]:
    """접근 가능한 GitHub 리포 목록 (TODO: GitHub API 연동)."""
    return []
