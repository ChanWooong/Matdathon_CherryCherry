# Frontend (React + Vite + TypeScript)

회의록 → GitHub 이슈 자동화 에이전트 웹 UI.

## 구조

```
src/
├── api/         # 백엔드 호출 (SSE 스트리밍 포함)
├── components/  # 재사용 UI (이슈 초안 카드, 스트리밍 패널 등)
├── hooks/       # 커스텀 훅
├── pages/       # 이슈 탭 / PR 탭 화면
└── types/       # 공용 타입
```

## 실행

```bash
cd frontend
npm install
npm run dev
```

- 개발 서버: http://localhost:5173
- `/api` 요청은 http://localhost:8000 (백엔드)로 프록시됩니다.
