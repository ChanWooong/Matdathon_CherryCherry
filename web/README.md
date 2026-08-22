# MeetToIssue — 프론트엔드

회의록을 붙여넣으면 AI 에이전트가 할 일을 추출·정리·검수하고, 사용자 승인 후 GitHub 이슈로 생성하는 앱의 웹 프론트엔드입니다. (PRD `../PRD.md`, 와이어프레임 `../wireframes/index.html`)

## 빠른 시작

```bash
cd web
npm install
npm run dev     # http://localhost:5173
```

백엔드 없이도 **전체 플로우가 동작합니다.** 기본값이 `mock` 모드라 브라우저 안에서 3개 에이전트 파이프라인을 시뮬레이션합니다. 회의록 화면의 `데모 회의록 채우기` 버튼으로 바로 시연할 수 있고, **직접 붙여넣은 회의록도 휴리스틱으로 파싱**해 초안을 만듭니다.

## 백엔드 연결

```bash
cp .env.example .env
# .env 에서 VITE_API_MODE=live 로 변경
npm run dev
```

`live` 모드에서 프론트가 기대하는 백엔드 계약:

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| GET | `/api/repos` | `Repo[]` |
| GET | `/api/repos/:owner/:repo/issues` | `Issue[]` |
| GET | `/api/repos/:owner/:repo/pulls` | `PullRequest[]` |
| POST | `/api/analyze` | **SSE** `StreamEvent` |
| POST | `/api/repos/:owner/:repo/issues/bulk` | `CreateResult[]` |
| POST | `/api/repos/:owner/:repo/pulls/:n/review` | **SSE** `ReviewEvent` |
| POST | `/api/repos/:owner/:repo/pulls/:n/comments` | `{ url }` |

타입 정의는 `src/types.ts`가 단일 소스입니다. SSE는 `data: {json}\n\n` 형식으로 흘려보내면 됩니다.

`StreamEvent` 순서 예시:

```
agent_start(extractor) → token* → decisions → tasks → agent_done(extractor)
agent_start(composer)  → progress* / token* → drafts → agent_done(composer)
agent_start(reviewer)  → token* → review → agent_done(reviewer)
done
```

## 구조

```
src/
  api/
    index.ts     mock/live 스위치 + Api 인터페이스
    mock.ts      브라우저 내 에이전트 시뮬레이터 (SSE 흉내)
    real.ts      실제 백엔드 REST + SSE 클라이언트
    extract.ts   회의록 휴리스틱 파서 (mock 전용)
    fixtures.ts  데모용 리포/이슈/PR 데이터
  screens/       S1~S8 화면
  components/    Header, 공용 UI
  store.ts       세션 상태 컨텍스트
```

## 화면

| 경로 | 화면 | PRD |
| --- | --- | --- |
| `/` | 리포 선택 | F1 |
| `/issues` | 이슈 목록 | F2 |
| `/new` | 회의록 입력 | F3 |
| `/analyze` | 분석 진행 (스트리밍) | F4·F5·F6 |
| `/review` | 검토 · 승인 | F7 |
| `/result` | 생성 결과 | F8 |
| `/pulls` | PR 목록 | E1 |
| `/pulls/:n` | PR 리뷰 리포트 | E2~E6 |

## 설계 원칙 반영

- **승인 게이트** — 이슈 생성/코멘트 게시는 사용자 승인 후에만 실행. 선택 0건이면 버튼 비활성.
- **근거 제시** — 모든 초안에 회의록 원문 인용을 붙여 환각을 완화.
- **AI 표시** — 초안·이슈·리뷰에 `🤖 AI 생성` 배지와 문구.
- **중단 가능** — 분석 중 [중단]으로 `AbortController` 취소.
- **접근성** — 스트리밍 영역 `aria-live`, 상태를 색+아이콘+텍스트로 3중 표기.
