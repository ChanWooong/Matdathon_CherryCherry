# MeetToIssue (Matdathon_CherryCherry)

회의록을 붙여넣으면 AI 에이전트가 할 일을 추출·정리·검수하고, 사용자 승인 후 GitHub 이슈로 일괄 생성하는 개인 생산성 앱.

자세한 내용은 [PRD.md](./PRD.md) 참고.

## 리포 구조

```
.
├── backend/    # FastAPI + Microsoft Agent Framework + Copilot SDK
├── frontend/   # React + Vite + TypeScript (반응형 웹)
├── web/        # 초기 UI 프로토타입(참고용)
├── infra/      # Azure IaC (Bicep / azd)
├── PRD.md
└── evaluation.md
```

## 빠른 시작

```bash
# 백엔드
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && cp .env.example .env
uvicorn app.main:app --reload --port 8000

# 프론트엔드 (새 터미널)
cd frontend && npm install && npm run dev
```

- 프론트: http://localhost:5173
- 백엔드 API 문서: http://localhost:8000/docs

프런트엔드는 기본적으로 실제 FastAPI를 사용하며, 프로젝트와 회의록은 MVP 범위에서 브라우저 `localStorage`에 보관합니다. 로그인은 채점 경로의 의존성을 없애기 위한 로컬 목업이며, GitHub 작업은 백엔드의 서버 토큰과 `X-API-Key` 보호 아래 수행됩니다.
