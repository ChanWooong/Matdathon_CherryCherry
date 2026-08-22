# MeetToIssue

회의록에서 실행 가능한 일을 찾아 **추출 → GitHub 이슈 구조화 → 누락 검수 → 사용자 승인 → 생성**까지 연결하는 개인 생산성 에이전트입니다.

## 완성 범위

- React 반응형 웹: 프로젝트, 다중 저장소, 회의록 보관, Issues/PR, 초안 검토, PR AI 리뷰
- FastAPI: typed GitHub API, POST 기반 SSE, 부분 실패 처리, 분석 이력
- Microsoft Agent Framework: `WorkflowBuilder` 기반 3-agent 순차 오케스트레이션
- GitHub Copilot SDK: 로컬 기본 provider로 세 에이전트와 함수 도구 실행
- Azure: Container Apps, ACR, Key Vault, managed identity, Azure OpenAI, App Insights를 Bicep으로 준비
- 책임 있는 AI: AI 고지, 원문 근거, 프롬프트 인젝션 방어, 승인 전 외부 변경 금지

> 실제 Azure 리소스 생성만 수행하지 않았습니다. [`deploy/`](./deploy/)의 사전검증·패키징·배포 스크립트까지 준비되어 있습니다.

## 평가 기준과 코드 근거

| 평가 항목 | 구현 근거 |
|---|---|
| Copilot SDK + Agent Framework | `backend/app/agents/chat_client.py`, `pipeline.py`: `GitHubCopilotAgent` 3개, `WorkflowBuilder`, `@executor`, 구조화 출력, 함수 도구, 토큰 스트리밍 |
| 생산성 | 회의록 한 번 입력으로 여러 이슈 초안 생성, 실제 분석 시간과 생성 건수를 결과 화면에 표시 |
| Azure | `deploy/main.bicep`: Container Apps, ACR, Key Vault, managed identity, Azure OpenAI, App Insights/Log Analytics |
| 기능 완성도 | 입력 → 분석 → 수정/제외 → 승인 → GitHub 생성, Issues/PR 조회, 읽기 전용 PR 리뷰 |
| UX | 단계·재시도 SSE, 로딩/빈 상태/오류/부분 실패, 반응형 Desk 디자인 |
| 책임 있는 AI | `approved=true` 서버 게이트, AI 고지, 필수 evidence, 허용 라벨/담당자 필터, 인젝션 격리 |
| 혁신성 | 요약에서 끝나지 않고 검수와 실제 실행까지 닫힌 루프 구성 |

## 실행 모드

| 환경 | 모델 provider | 이유 |
|---|---|---|
| 로컬·코드 평가 | `copilot_sdk` | Copilot SDK를 Agent Framework 전체 워크플로의 기본 런타임으로 사용 |
| Azure 배포 | `azure_openai` | Container Apps managed identity로 비대화형·키 없는 인증 |

두 provider 모두 `SupportsAgentRun`을 구현하므로 오케스트레이션 코드는 동일합니다. 폐기된 GitHub Models provider는 코드에서 제거했습니다.

## 로컬 실행

요구 사항: Python 3.12, Node.js 20+, GitHub Copilot CLI 사용 권한, GitHub PAT.

```bash
# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev,copilot]"
.venv/bin/python -m copilot download-runtime
cp .env.example .env                 # GITHUB_TOKEN 입력
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (새 터미널)
cd frontend
npm ci
cp .env.example .env
npm run dev
```

- 앱: <http://localhost:5173>
- API 문서: <http://localhost:8000/docs>
- 로그인은 OAuth가 아닌 로컬 데모 identity입니다. GitHub 호출은 서버의 `GITHUB_TOKEN`만 사용합니다.
- 공개 저장소 연결은 토큰 없이 GitHub URL 또는 `owner/repo`로 조회할 수 있으며, 이슈 생성에는 서버 토큰이 필요합니다.
- 실제 API가 없는 UI 시연은 frontend에서 `VITE_API_MODE=mock`으로 전환합니다.

## 검증

```bash
cd backend
.venv/bin/pytest -q
.venv/bin/ruff check app tests

cd ../frontend
npm run lint
npm run build

cd ..
./deploy/preflight.sh --check-only
./deploy/package.sh
```

모델과 GitHub 네트워크 호출은 테스트에서 fake/mock으로 대체됩니다.

## Azure 인수인계

```bash
./deploy/preflight.sh
./deploy/package.sh
export GITHUB_TOKEN=...
export API_KEY=...
./deploy/deploy.sh rg-meettoissue-prod koreacentral
```

배포 담당자는 [`deploy/README.md`](./deploy/README.md)만 따라가면 됩니다. `package.sh`는 Git, 테스트, 캐시, 로컬 환경변수와 문서를 제외하고 배포에 필요한 런타임 입력만 묶습니다.

Azure에서는 `MODEL_PROVIDER=azure_openai`가 명시되며, Copilot CLI나 사용자 로그인이 필요하지 않습니다. 브라우저 번들에 들어가는 공유 API 키는 데모 접근 제어용이지 비밀이 아니므로, 공개 서비스 전환 시 사용자 인증으로 교체해야 합니다.

## 구조

```text
.
├── backend/        # FastAPI, Agent Framework, Copilot/Azure provider, tests
├── frontend/       # React + Vite, typed API/SSE client, local project state
├── deploy/         # Azure IaC, 통합 Dockerfile, preflight/package/deploy
├── PRD.md
└── evaluation.md
```

세부 API·보안·오류 처리: [`backend/README.md`](./backend/README.md)
프런트 상태·환경변수: [`frontend/README.md`](./frontend/README.md)
