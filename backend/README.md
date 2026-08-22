# MeetToIssue Backend

회의록을 GitHub 이슈 초안으로 바꾸는 **3-에이전트 파이프라인** FastAPI 백엔드.

- **Azure OpenAI / GitHub Copilot SDK** — 에이전트 모델 연결
- **Microsoft Agent Framework** — 에이전트 설계, 순차 오케스트레이션, 스트리밍
- **Azure** — Container Apps 배포, Key Vault 비밀 관리, App Insights 관찰성

## 빠른 시작

```bash
cd backend

# 1) 가상환경 + 의존성
uv venv --python 3.12
uv pip install -e ".[dev]"

# 2) 환경변수
cp .env.example .env
#   GITHUB_TOKEN을 채운다 (스코프: repo, read:user)

# 3) 실행
.venv/bin/uvicorn app.main:app --reload --port 8000
```

- API 문서: http://localhost:8000/docs
- 헬스 체크: http://localhost:8000/health

### 테스트

```bash
.venv/bin/pytest -q        # 네트워크 없이 전부 실행된다 (모델·GitHub 모두 모킹)
.venv/bin/ruff check app tests
```

## 아키텍처

```
POST /api/analyze  (SSE)
        │
        ▼
  WorkflowBuilder (Microsoft Agent Framework)
        │
   ┌────┴──────────────┬───────────────────┐
   ▼                   ▼                   ▼
🔍 extract         📝 compose          ✅ review
ExtractionResult → CompositionResult → ReviewResult
   │                   │                   │
   └───── ctx.add_event(StageEvent | DeltaEvent) ─────┐
                                                      ▼
                                              SSE 프레임으로 중계
                                                      │
                                                      ▼
                                         사용자 검토 · 수정 · 승인
                                                      │
                                                      ▼
                                      POST /api/issues (approved=true)
                                                      │
                                                      ▼
                                              GitHub 이슈 생성
```

각 단계의 출력이 다음 단계의 입력이 되는 **순차 오케스트레이션**이며,
`workflow.run(stream=True)`로 나오는 이벤트를 SSE로 그대로 중계한다.

### 디렉터리

```
backend/
├── app/
│   ├── main.py              FastAPI 앱 생성, lifespan, CORS
│   ├── schemas.py           에이전트 간 계약 + API 모델
│   ├── api/
│   │   ├── routes.py        SSE 분석, 이슈 생성, 이력, 리포/라벨
│   │   └── github_routes.py 이슈/PR 조회, 읽기 전용 AI PR 리뷰
│   ├── agents/
│   │   ├── prompts.py       시스템 프롬프트 + 인젝션 방어 규칙
│   │   ├── chat_client.py   모델 공급자 (Azure OpenAI | Copilot SDK)
│   │   ├── pr_review.py     구조화된 읽기 전용 PR 리뷰
│   │   └── pipeline.py      3-에이전트 순차 워크플로
│   ├── services/
│   │   ├── github.py        이슈 생성, 리포/이슈/PR 조회
│   │   └── history.py       분석 이력 (원문 미저장)
│   └── core/
│       ├── config.py        설정 + Key Vault
│       └── telemetry.py     App Insights
├── infra/
│   ├── main.bicep           Container Apps + Key Vault + App Insights
│   └── deploy.sh            반복 가능한 배포
└── tests/                   네트워크 불필요
```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/analyze` | 회의록 분석 (SSE 스트리밍). **아무것도 생성하지 않는다** |
| `POST` | `/api/issues` | 승인된 초안을 이슈로 생성. `approved=true` 필수 |
| `GET` | `/api/repos` | 접근 가능한 리포 목록 (토큰이 없으면 빈 배열) |
| `GET` | `/api/repos/resolve?q=...` | `owner/repo` 또는 GitHub 링크를 실제 리포로 해석 (public 리포는 토큰 없이 조회 가능) |
| `GET` | `/api/repos/{owner}/{repo}/labels` | 리포의 실제 라벨 |
| `GET` | `/api/repos/{owner}/{repo}/issues?limit=30` | 열린 이슈 (`1..100`, PR 제외) |
| `GET` | `/api/repos/{owner}/{repo}/pulls?limit=30` | 열린 PR |
| `GET` | `/api/repos/{owner}/{repo}/pulls/{number}` | PR 상세 |
| `POST` | `/api/repos/{owner}/{repo}/pulls/{number}/review` | 구조화된 AI PR 리뷰. GitHub에는 게시하지 않음 |
| `GET` | `/api/history` | 분석 이력 목록 |
| `GET` | `/api/history/{id}` | 이력 상세 |
| `DELETE` | `/api/history/{id}` | 이력 삭제 |
| `GET` | `/health` | 헬스 체크 |

### SSE 이벤트

| 이벤트 | payload | 의미 |
|---|---|---|
| `start` | `{analysis_id, repo, label_count}` | 분석 시작 |
| `stage` | `StageEvent` | 단계 시작/완료/실패 (+ 소요 시간, 시도 횟수) |
| `delta` | `DeltaEvent` | 토큰 단위 부분 출력 |
| `result` | `AnalysisResult` | 최종 초안 + 검수 결과 |
| `error` | `ErrorEvent` | 복구 불가 오류 |
| `done` | `{analysis_id}` | 스트림 종료. 성공·실패 모두에서 발생하지만, 클라이언트가 먼저 끊은 경우에는 보내지 않는다 |

```bash
curl -N -X POST http://localhost:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: ${API_KEY}" \
  -d '{"transcript":"찬웅님이 다음 주 금요일까지 결제 API 타임아웃을 5초로 낮춰주세요.","repo":"owner/repo"}'
```

> `API_KEY`를 설정하지 않은 로컬 환경에서는 `X-API-Key` 헤더를 생략해도 된다.
> 백엔드는 로그인·토큰 교환 엔드포인트를 제공하지 않는다. GitHub 호출에는 서버의
> `GITHUB_TOKEN`만 사용한다.

### GitHub 조회와 PR 리뷰 응답

- 리포: `RepoSummary[]` — `id` (GitHub의 안정적인 numeric ID), `full_name`, `name`,
  `owner`, `private`, `description`, `default_branch`, `language`, `html_url`,
  `open_issues_count`, `updated_at`, `pushed_at`. GitHub 원본 필드의 의미대로
  `open_issues_count`에는 열린 PR도 포함될 수 있다.
- 이슈: `GitHubIssueSummary[]` — `number`, `title`, `state`, `html_url`, `body`,
  `user`, `labels`, `assignees`, `comments`, `created_at`, `updated_at`
- PR 목록: `GitHubPullRequestSummary[]` — `number`, `title`, `state`, `html_url`,
  `draft`, `user`, `head_ref`, `base_ref`, `created_at`, `updated_at`
- PR 상세: 목록 필드 + `body`, `merged`, `mergeable`, `additions`, `deletions`,
  `changed_files`, `commits`, `comments`, `review_comments`, `diff_url`, `patch_url`
- AI 리뷰: `{repo, pull_number, verdict, summary, findings, posted_to_github:false}`.
  각 finding은 `{severity,title,message,suggestion,file,line}`이다. 모델 설정이 빠졌으면
  `503`, 모델 출력 스키마가 잘못됐으면 `502`를 반환한다.

PR 리뷰는 Agent Framework의 기존 `build_agent` 모델 추상화를 사용하며 diff를 읽기만 한다.
GitHub에 POST하는 코드나 도구를 에이전트에 제공하지 않는다. `PR_REVIEW_MAX_DIFF_CHARS`
(기본 100,000)를 넘는 diff는 잘렸다는 표식과 함께 제한된다.

## 모델 공급자

| `MODEL_PROVIDER` | 설명 |
|---|---|
| `azure_openai` (기본) | Azure OpenAI / Azure AI Foundry 배포. 구조화 출력이 안정적이라 서버에 적합. API 키 없이 관리 ID로 인증 가능 |
| `copilot_sdk` | `agent-framework-github-copilot`의 `GitHubCopilotAgent`. Copilot CLI를 JSON-RPC로 제어 |
| ~~`github_models`~~ | **2026-07-30 폐지.** 엔드포인트가 HTTP 410을 반환한다. 과거 설정 호환용으로만 남아 있고 선택 시 경고한다 |

> ⚠️ GitHub Models는 2026년 7월 30일 완전히 폐지됐다. 초안 설계는 GitHub Models를 기본으로
> 삼았지만, 실제 호출이 `410 github_models_retirement_brownout`을 반환하는 것을 확인해
> 기본 공급자를 Azure OpenAI로 교체했다. 오케스트레이터 코드는 `SupportsAgentRun` 덕분에
> 한 줄도 바뀌지 않았고, 설정과 연결 계층만 교체했다.

`azure_openai`를 쓰려면 (`infra/deploy.sh`가 리소스·배포·권한을 자동 생성한다):

```bash
export AZURE_OPENAI_ENDPOINT=https://<리소스>.openai.azure.com/
export MODEL_ID=gpt-4o          # 모델명이 아니라 "배포 이름"
az login                        # 또는 AZURE_OPENAI_API_KEY 설정
uv pip install -e ".[azure]"
```

`copilot_sdk`를 쓰려면:

```bash
uv pip install -e ".[copilot]"
.venv/bin/python -m copilot download-runtime
```

두 경로 모두 Agent Framework의 `SupportsAgentRun` 계약을 만족하므로
오케스트레이터 코드는 바뀌지 않는다.

## 책임 있는 AI · 보안

| 항목 | 구현 위치 |
|---|---|
| 승인 게이트 | `routes.create_issues` — `approved=true`가 아니면 400. 토큰 검사보다 **먼저** 수행 |
| 접근 제어 | `api.dependencies.require_api_key` — 서버가 **자신의** PAT로 이슈를 만들기 때문에, 인증 없이 공개하면 그 권한을 누구나 빌려 쓸 수 있다. `API_KEY` 설정 시 모든 `/api` 요청에 `X-API-Key`를 요구하고, `ENVIRONMENT=prod`인데 키가 비면 열린 채로 뜨는 대신 503으로 잠근다. (`approved` 필드는 UX 장치일 뿐, CORS는 브라우저 전용이라 둘 다 접근 통제가 아니다) |
| AI 생성 표시 | `IssueDraft.to_github_body()` — 모든 이슈 본문 최상단에 고지 |
| 근거 인용 | `ExtractedTask.evidence` 필수 — 근거 없는 할 일은 추출하지 않음 |
| 프롬프트 인젝션 | `prompts.INJECTION_GUARD` + `pipeline._fence_untrusted()` — 회의록을 구분자로 격리하고 구분자 위조를 무력화 |
| 환각 방지 | `pipeline._sanitize_drafts()` — 리포에 없는 라벨·담당자를 코드 레벨에서 제거 |
| 비밀 관리 | `config._load_secrets_from_key_vault()` — 운영에서는 `github-token`·`api-key`를 Key Vault에서 로드, 코드에 하드코딩 없음 |
| 개인정보 | 회의록 원문은 **저장하지 않음**. `PERSIST_TRANSCRIPT=true`로 명시 동의 시에만 저장 |

## 오류 처리

- **에이전트 단계 실패** → `MAX_RETRIES`만큼 재시도. 각 시도가 `stage` 이벤트로 노출돼 프론트가 "재시도 중"을 표시할 수 있다
- **이슈 생성 부분 실패** → 성공/실패를 초안 단위로 구분해 반환 (`succeeded_count` / `failed_count`)
- **라벨·담당자 오류(422)** → 해당 필드를 빼고 1회 재시도해 이슈 자체는 살린다
- **리포 컨텍스트 조회 실패** → 라벨 없이 분석을 계속 진행
- **클라이언트 연결 끊김** → 스트림을 즉시 중단해 토큰 낭비를 막는다

## Azure 배포

```bash
export GITHUB_TOKEN=ghp_...
./infra/deploy.sh rg-meettoissue-dev koreacentral
```

- 관리 ID 기반 **비밀번호 없는** ACR/Key Vault 접근
- `minReplicas: 1` — 데모 중 콜드 스타트 방지
- `/health` 라이브니스·레디니스 프로브
- App Insights로 단계별 소요 시간·실패율 추적

### GitHub Actions 자동 배포

`main`에 `backend/**` 변경이 푸시되면 `.github/workflows/deploy-backend.yml`이 자동으로 배포를 수행합니다.
수동 배포도 Actions 탭에서 `Deploy backend`를 실행하면 됩니다.

필요한 저장소 시크릿:

- `AZURE_CREDENTIALS`: `azure/login@v2`용 서비스 프린시펄 JSON
- `BACKEND_GITHUB_TOKEN`: 서버가 이슈 생성에 사용할 PAT (`repo`, `read:user`)
- `BACKEND_API_KEY`: `/api` 보호용 키 (프론트 `VITE_API_KEY`와 동일 값)

선택 저장소 변수(없으면 workflow 기본값 사용):

- `BACKEND_ENVIRONMENT` (기본 `dev`)
- `BACKEND_RESOURCE_GROUP` (기본 `rg-meettoissue-dev`)
- `BACKEND_LOCATION` (기본 `koreacentral`)
