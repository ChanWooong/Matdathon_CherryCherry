# Backend (FastAPI)

회의록 → GitHub 이슈 자동화 에이전트 백엔드.

## 구조

```
app/
├── agents/    # 추출/정리/검수 에이전트 (Microsoft Agent Framework)
├── api/       # FastAPI 라우터 (스트리밍 SSE 포함)
├── core/      # 설정, 로깅, 관찰성
├── schemas/   # Pydantic 모델
└── services/  # GitHub API 등 외부 연동
tests/
```

## 실행

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # GITHUB_TOKEN 채우기
uvicorn app.main:app --reload --port 8000
```

- API 문서: http://localhost:8000/docs
- 헬스체크: http://localhost:8000/health

## 테스트

```bash
pytest
```
