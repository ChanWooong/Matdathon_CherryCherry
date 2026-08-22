# MeetToIssue frontend

회의록을 프로젝트별로 보관하고, 선택한 GitHub 저장소에 AI가 만든 이슈 초안을 검토·승인한 뒤 게시하는 React 앱입니다. 저장소의 열린 이슈/PR 조회와 PR AI 리뷰도 FastAPI 백엔드에 연결됩니다.

## 실행

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

- 앱: <http://localhost:5173>
- 백엔드: 기본 <http://localhost:8000>
- 프로덕션 빌드: `npm run build`
- 타입/린트 검사: `npm run lint`

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `VITE_API_MODE` | `live` | `live`는 FastAPI, `mock`은 브라우저 내 데모 데이터 |
| `VITE_API_URL` | `/api` | API prefix를 포함한 URL |
| `VITE_API_KEY` | 빈 값 | 백엔드 `API_KEY`와 같은 `X-API-Key` 값 |
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Vite 개발 프록시 대상 |
| `VITE_DEMO_BYPASS_AUTH` | `true` | 채점용 no-auth 경로. 로그인 화면 없이 데모 사용자로 바로 진입 |

로그인은 항상 로컬 목업이며 실제 인증 경로나 OAuth 토큰을 만들지 않습니다. 기본 채점 경로는 로그인 화면을 건너뛰고 샘플 프로젝트와 회의록을 준비하지만, GitHub 저장소/이슈/PR, 회의록 분석, 이슈 생성, PR 리뷰는 `live` 모드에서 실제 백엔드 API를 사용합니다. 프로젝트, 연결 저장소 ID, 회의록은 MVP 상태 계층인 모드별 `localStorage`(`m2i.db.v3.live`/`mock`)에 저장됩니다.

## 구조

```text
src/
├── api/          # typed JSON/SSE client, 기능별 API, 선택적 mock
├── components/   # 재사용 UI/layout/domain 컴포넌트
├── features/     # auth, projects, meetings, repos, issues, pulls
├── lib/          # 비동기 상태와 포맷 유틸
├── routes/       # 인증 라우트 가드
├── styles/       # Desk 팔레트 디자인 토큰과 전역 스타일
└── types.ts      # 화면/API 공용 타입
```

`POST /api/analyze`는 `fetch`와 `ReadableStream`으로 named SSE 이벤트를 처리합니다. 이슈 생성은 사용자가 선택한 초안에 대해 `approved: true`를 명시적으로 전송할 때만 실행됩니다. PR AI 리뷰는 화면에 검토용 초안으로만 표시하며 GitHub에 자동 게시하지 않습니다.
