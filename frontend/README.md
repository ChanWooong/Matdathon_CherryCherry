# MeetToIssue — 프론트엔드

회의록을 붙여넣으면 에이전트가 할 일과 결정사항을 읽어내고, 검수를 거쳐 사용자가 승인한 것만 GitHub 이슈로 올립니다.
PR 에는 AI 리뷰 코멘트 초안을 만들어 줍니다.

- 제품 정의: [`../PRD.md`](../PRD.md)
- 디자인 가이드: [`../DESIGN.md`](../DESIGN.md)
- 와이어프레임: [`../wireframes/index.html`](../wireframes/index.html)

## 빠른 시작

```bash
cd web
npm install
npm run dev     # http://localhost:5173
```

백엔드 없이도 **전체 플로우가 그대로 동작합니다.** 기본값이 `mock` 모드라 브라우저 안에서 에이전트 파이프라인을 시뮬레이션하고, 상태는 `localStorage`(`m2i.db.v2`)에 남아 새로고침해도 유지됩니다.
회의록은 데모 샘플뿐 아니라 **직접 붙여넣은 글도 규칙 기반 파서로 읽어냅니다.**

## 백엔드 연결

```bash
cp .env.example .env
# 채점/데모 권장값
# VITE_API_MODE=live
# VITE_DEMO_BYPASS_AUTH=true
# VITE_API_BASE=/api
npm run dev
```

`src/api/*.ts` 의 각 함수는 앞부분에서 mock 을 처리하고 뒤에서 실제 요청을 보냅니다.
백엔드가 붙으면 **화면 코드는 한 줄도 바뀌지 않습니다.**

`VITE_DEMO_BYPASS_AUTH=true` 일 때는 OAuth 없이 데모 사용자로 자동 로그인되어,
인증 이슈 없이도 live 백엔드 API 연결 시연이 가능합니다.

---

## 화면 구조

```
/login                                     GitHub 로그인
/                                          홈 — 프로젝트 폴더 노드
/p/:projectId                              프로젝트 구성 — 레포/회의록 탭, 호버 추가 메뉴
/p/:projectId/meetings/new                 회의록 작성 (제목 + 본문)
/p/:projectId/meetings/:meetingId          회의록 보기/수정
/p/:projectId/repos/:repoId                레포 — 이슈(기본) / PR 탭
/p/:projectId/repos/:repoId/pulls/:number  PR 본문 + AI 리뷰
/p/:projectId/issues/new                   회의록 골라 이슈 만들기
```

## 폴더 구조

```
src/
├─ styles/
│  ├─ tokens.css        디자인 토큰 한 곳 (DESIGN.md 참고)
│  └─ base.css          리셋 · 타이포 · 유틸
├─ components/
│  ├─ ui/               재사용 UI 키트 (Button, Field, List, Modal, HoverMenu …)
│  ├─ layout/           Header, Page/PageHead/Section/BackLink
│  └─ domain/           ProjectNode, AgentRail, DraftCard
├─ features/            화면. 폴더 = 기능 단위
│  ├─ auth/ projects/ meetings/ repos/ issues/ pulls/
├─ api/                 기능 단위로 나뉜 데이터 레이어 (아래 표)
│  └─ mock/             백엔드 없을 때만 쓰는 시뮬레이션. 붙으면 통째로 버립니다.
├─ lib/                 format, useAsync
└─ routes/              RequireAuth
```

컴포넌트는 `.tsx` 옆에 같은 이름의 `.module.css` 를 둡니다. 전역 CSS 는 `styles/` 두 파일뿐입니다.

---

## API 계약 (백엔드 담당자용)

`src/api/` 의 파일 하나가 백엔드 모듈 하나에 대응합니다. 그대로 미러링하면 됩니다.

### `auth.ts`

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| GET | `/auth/me` | `User` · 미로그인 시 401 |
| GET | `/auth/github/start` | GitHub OAuth 로 리다이렉트 |
| POST | `/auth/logout` | — |

### `projects.ts`

| 메서드 | 경로 | 본문 / 응답 |
| --- | --- | --- |
| GET | `/projects` | `Project[]` |
| GET | `/projects/:id` | `Project` |
| POST | `/projects` | `{ name, description }` → `Project` |
| DELETE | `/projects/:id` | — |

### `repos.ts`

| 메서드 | 경로 | 본문 / 응답 |
| --- | --- | --- |
| GET | `/github/repos` | `Repo[]` — 로그인 사용자가 접근 가능한 전체 |
| GET | `/projects/:id/repos` | `Repo[]` — 프로젝트에 등록된 것 |
| POST | `/projects/:id/repos` | `{ repoIds: number[] }` → `Repo[]` (다중 선택) |
| DELETE | `/projects/:id/repos/:repoId` | — |

### `meetings.ts`

| 메서드 | 경로 | 본문 / 응답 |
| --- | --- | --- |
| GET | `/projects/:id/meetings` | `Meeting[]` |
| GET | `/projects/:id/meetings/:mid` | `Meeting` |
| POST | `/projects/:id/meetings` | `{ title, body }` → `Meeting` |
| PATCH | `/projects/:id/meetings/:mid` | `{ title?, body? }` → `Meeting` |
| DELETE | `/projects/:id/meetings/:mid` | — |

### `issues.ts`

| 메서드 | 경로 | 본문 / 응답 |
| --- | --- | --- |
| GET | `/repos/:repoId/issues?state=open\|closed\|all` | `Issue[]` |
| GET | `/repos/:repoId/issues/:number` | `Issue` |
| POST | `/repos/:repoId/issues/bulk` | `{ drafts: Draft[], meetingId? }` → `CreateResult[]` |

### `pulls.ts`

| 메서드 | 경로 | 본문 / 응답 |
| --- | --- | --- |
| GET | `/repos/:repoId/pulls` | `PullRequest[]` |
| GET | `/repos/:repoId/pulls/:number` | `PullRequest` |
| POST | `/repos/:repoId/pulls/:number/comments` | `{ body }` |

### `agents.ts` — SSE

`Content-Type: text/event-stream`, 프레임은 `data: {json}\n\n`.

**POST `/agents/issues/stream`** — 본문 `{ meetingId, repoId, text }`

```
agent_start  { agent: "extractor" }
token        { agent: "extractor", text: "…" }      ← 여러 번
decisions    { items: Decision[] }
tasks        { items: TaskItem[] }
agent_done   { agent: "extractor", ms, note }

agent_start  { agent: "composer" }
progress     { agent: "composer", note, progress: 0~100 }   ← 초안 개수만큼
drafts       { items: Draft[] }
agent_done   { agent: "composer", ms, note }

agent_start  { agent: "reviewer" }
token        { agent: "reviewer", text: "…" }
review       { items: { draftId, warnings: string[] }[] }
agent_done   { agent: "reviewer", ms, note }

done         { }
```

할 일을 하나도 못 찾으면 `error { agent, message }` 를 보내고 바로 `done` 으로 끝냅니다.

**POST `/agents/review/stream`** — 본문 `{ repoId, number }`

`agent` 는 `requirements`(요구사항 대조) → `quality`(변경 품질) → `summary`(리뷰 요약) 순으로 세 번 반복됩니다.

```
agent_start  { agent }
findings     { agent, items: Finding[] }   Finding = { id, status: pass|warn|fail|info, text, ref? }
agent_done   { agent, ms, note }
…            ← 세 agent 반복
done         { }
```

이벤트 종류와 **순서**만 지키면 화면은 mock 이든 live 든 똑같이 그립니다.

---

## mock 모드가 하는 일

| 파일 | 역할 |
| --- | --- |
| `api/mock/db.ts` | `localStorage` 기반 목 DB. 프로젝트·회의록 시드 포함 |
| `api/mock/fixtures.ts` | 레포 6개, 이슈/PR, 샘플 회의록 |
| `api/mock/extract.ts` | 규칙 기반 회의록 파서 — **백엔드 LLM 이 대체할 자리** |
| `api/mock/agents.mock.ts` | 위 SSE 이벤트를 지연과 함께 그대로 흘려보냄 |

### 파서 확인

```bash
npx esbuild src/api/mock/extract.ts --format=esm --outfile=/tmp/ex.mjs
npx esbuild src/api/mock/fixtures.ts --format=esm --outfile=/tmp/fx.mjs
node --input-type=module -e "
import { extractFromText, tasksToDrafts } from '/tmp/ex.mjs';
import { SAMPLE_MEETING } from '/tmp/fx.mjs';
for (const d of tasksToDrafts(extractFromText(SAMPLE_MEETING).tasks))
  console.log(d.labels.join(','), '|', d.assignee, '|', d.due, '|', d.title);
"
```

## 스크립트

```bash
npm run dev       # 개발 서버
npm run build     # 타입 검사 + 프로덕션 빌드
npm run preview   # 빌드 결과 확인
```

## 알아 둘 것

- `tsconfig` 에 `erasableSyntaxOnly` 가 켜져 있습니다. 생성자 파라미터 프로퍼티(`constructor(private x: T)`)를 쓸 수 없습니다.
- `StrictMode` 를 쓰지 않습니다. 이중 마운트가 SSE 스트림을 두 번 시작시킵니다.
- 아이콘은 `components/ui/Icon.tsx` 의 스트로크 SVG 만 씁니다. 이모지를 UI 아이콘으로 쓰지 않습니다.
