# TRD: MeetToIssue 기술 요구사항

> 문서 상태: 구현 기준  
> 연관 문서: [PRD.md](./PRD.md), [DESIGN.md](./DESIGN.md)  
> 대상 버전: MVP `0.1.x`

## 1. 목적

이 문서는 회의록을 AI로 분석해 사용자의 승인 후 GitHub 이슈로 생성하는
MeetToIssue의 기술 요구사항과 시스템 계약을 정의한다. 제품 범위와 사용자 경험은
PRD를 따르며, 본 문서는 구현·배포·운영·테스트에서 지켜야 할 기준을 다룬다.

## 2. 범위

### 2.1 포함

- GitHub 리포지토리, 이슈, PR 조회
- 회의록 기반 이슈 초안 생성 3단계 파이프라인
- Server-Sent Events(SSE) 기반 진행 상황 및 결과 스트리밍
- 사용자 승인 이후의 GitHub 이슈 일괄 생성
- 분석 이력 저장과 삭제
- 읽기 전용 AI PR 리뷰
- Azure Container Apps 배포, Key Vault 비밀 관리, App Insights 관찰성
- 반응형 React 웹 클라이언트

### 2.2 제외

- 백엔드의 GitHub OAuth 로그인 및 토큰 교환
- 승인 없는 자동 이슈 생성
- AI PR 리뷰의 GitHub 자동 게시
- 다중 사용자용 서버 세션 및 프로젝트 데이터베이스
- 회의록 원문의 기본 영구 저장

## 3. 시스템 컨텍스트

```text
브라우저
  └─ React + TypeScript
       ├─ REST/JSON ───────────────┐
       └─ POST 기반 SSE ──────────┤
                                  ▼
                        FastAPI 백엔드
                          ├─ Agent Framework
                          │    ├─ Extractor
                          │    ├─ Composer
                          │    └─ Reviewer
                          ├─ GitHub REST API
                          ├─ SQLite 이력
                          └─ OpenTelemetry
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
          Azure OpenAI      Azure Key Vault   App Insights
```

### 3.1 핵심 설계 원칙

1. **분석과 실행 분리**: `/api/analyze`는 초안만 만들고 외부 변경을 수행하지 않는다.
2. **명시적 승인**: 이슈 생성은 `/api/issues`의 `approved=true` 요청에서만 허용한다.
3. **구조화된 계약**: 에이전트 간 출력과 API 모델은 Pydantic 스키마로 검증한다.
4. **공급자 추상화**: 모델 공급자는 Agent Framework의 공통 실행 계약 뒤에 둔다.
5. **최소 데이터 보관**: 회의록 원문은 기본적으로 저장하지 않는다.
6. **부분 실패 허용**: 여러 이슈 중 일부 생성 실패가 전체 성공을 무효화하지 않는다.

## 4. 기술 스택

| 영역 | 기술 | 요구 버전/역할 |
| --- | --- | --- |
| 프론트엔드 | React, TypeScript, Vite | React 19, TypeScript 6, Vite 8 |
| 라우팅 | React Router | 클라이언트 화면 전환 |
| 백엔드 | Python, FastAPI | Python 3.11 이상 3.14 미만, 비동기 API |
| 데이터 검증 | Pydantic | API 및 에이전트 출력 계약 |
| 에이전트 | Microsoft Agent Framework | 순차 워크플로와 스트리밍 이벤트 |
| 모델 | Azure OpenAI / Copilot SDK | 환경별 선택 가능 |
| GitHub 연동 | `httpx` | 비동기 GitHub REST API 호출 |
| 이력 | SQLite | 분석 요약, 초안, 생성 결과 저장 |
| 인프라 | Bicep, Azure Container Apps | 반복 가능한 백엔드 배포 |
| 비밀 | Azure Key Vault | GitHub PAT 및 API 접근 키 |
| 관찰성 | OpenTelemetry, App Insights | 로그, 트레이스, 단계별 지표 |
| 테스트 | pytest, pytest-asyncio, respx | 외부 네트워크 없는 백엔드 테스트 |
| 정적 검사 | Ruff, oxlint | Python 및 TypeScript 코드 품질 |

## 5. 컴포넌트 요구사항

### 5.1 프론트엔드

프론트엔드는 `frontend/`를 운영 구현으로 사용하고 `web/`은 초기 프로토타입으로만
유지한다.

- `VITE_API_URL`을 API 기준 URL로 사용하며 기본값은 `/api`이다.
- `VITE_API_MODE=mock|live`로 목 데이터와 실제 API를 전환할 수 있어야 한다.
- 실제 분석 요청은 `fetch` 기반 POST로 전송하고 응답 본문에서 SSE를 파싱해야 한다.
- 사용자가 분석을 중단하면 `AbortSignal`로 네트워크와 서버 작업을 취소해야 한다.
- `start`, `stage`, `delta`, `result`, `error`, `done` 이벤트를 구분해 처리해야 한다.
- 초안은 사용자가 수정·선택·제외할 수 있어야 하며, 선택된 초안만 생성 요청에 포함한다.
- 프로젝트와 회의록 작업 상태는 MVP에서 `localStorage`에 저장할 수 있다.
- 로그인 UI는 데모용 로컬 목업이며 실제 권한 경계로 취급하지 않는다.
- 키보드 내비게이션, 포커스 표시, ARIA 상태 안내를 제공해야 한다.
- UI 시각 규칙과 디자인 토큰은 `DESIGN.md` 및 `frontend/src/styles/`를 따른다.

### 5.2 API 서버

- 앱 팩토리 패턴으로 설정을 주입할 수 있어야 한다.
- 모든 `/api` 라우트는 공통 API 키 의존성을 적용해야 한다.
- `/health`는 외부 서비스에 접근하지 않고 컨테이너 상태를 반환해야 한다.
- API 입력은 길이, 형식, 빈 문자열 여부를 서버에서 검증해야 한다.
- GitHub 리포 참조는 `owner/repo` 또는 GitHub URL을 정규화해 사용해야 한다.
- 클라이언트가 SSE 연결을 끊으면 파이프라인 실행과 후속 프레임 전송을 중단해야 한다.
- CORS 허용 오리진은 환경 변수로 제한해야 하며 CORS를 인증 수단으로 사용하지 않는다.

### 5.3 에이전트 파이프라인

파이프라인은 다음 단계를 순차 실행한다.

| 순서 | 에이전트 | 입력 | 출력 | 책임 |
| --- | --- | --- | --- | --- |
| 1 | Extractor | 회의록 | `ExtractionResult` | 결정, 할 일, 담당자, 기한, 근거 추출 |
| 2 | Composer | 추출 결과 + 리포 컨텍스트 | `CompositionResult` | GitHub 이슈 초안과 검증 가능한 AC 작성 |
| 3 | Reviewer | 추출 결과 + 초안 | `ReviewResult` | 누락, 중복, 모호성 검수 |

기술 요구사항은 다음과 같다.

- 각 단계 출력은 지정된 Pydantic 모델을 만족해야 한다.
- 할 일에는 회의록 원문 근거인 `evidence`가 반드시 있어야 한다.
- 각 초안에는 프론트엔드에서 유지되는 안정적인 `draft_id`가 있어야 한다.
- Composer가 제안한 라벨과 담당자는 GitHub에서 조회한 실제 값과 대조해 정제해야 한다.
- 각 단계는 설정된 횟수만큼 독립적으로 재시도할 수 있어야 한다.
- 단계 시작·완료·실패와 시도 횟수는 `StageEvent`로 노출해야 한다.
- 모델의 부분 출력은 `DeltaEvent`로 전달해야 한다.
- 회의록은 신뢰하지 않는 데이터로 구분해 프롬프트 지시로 실행되지 않도록 격리해야 한다.
- 모델 공급자 변경이 워크플로와 API 계층의 변경을 요구해서는 안 된다.

### 5.4 GitHub 서비스

- 서버 측 GitHub PAT만 사용하며 브라우저에 PAT를 노출하지 않는다.
- 토큰이 없을 때 리포 목록은 빈 배열을 반환할 수 있으나, 생성 요청은 명시적 오류로
  실패해야 한다.
- 리포지토리, 라벨, 할당 가능한 사용자, 열린 이슈, 열린 PR과 PR 상세를 조회해야 한다.
- GitHub API 오류 상태를 가능한 한 보존하고, 그 외 업스트림 오류는 `502`로 변환한다.
- 이슈 생성은 설정된 동시성 한도 내에서 병렬 실행해야 한다.
- 잘못된 라벨 또는 담당자로 `422`가 발생하면 해당 필드를 제거하고 한 번 재시도한다.
- 생성 결과는 초안별 성공 여부, 이슈 번호, URL 또는 오류 메시지를 포함해야 한다.
- PR 리뷰는 diff를 읽기만 하며 GitHub에 쓰기 요청을 수행하지 않는다.
- 리뷰 입력 diff는 `PR_REVIEW_MAX_DIFF_CHARS`를 초과하지 않도록 제한해야 한다.

### 5.5 이력 저장소

- 기본 저장소는 로컬 SQLite 파일이다.
- 분석 ID, 회의 제목, 요약, 초안, 검수 결과, 생성 결과를 조회할 수 있어야 한다.
- `PERSIST_TRANSCRIPT=false`에서는 회의록 원문을 저장하지 않아야 한다.
- 이력 저장 실패가 분석 또는 이슈 생성의 성공 응답을 막아서는 안 되며 경고 로그를 남긴다.
- 목록 조회는 최대 100건으로 제한하고 개별 조회 및 삭제를 지원해야 한다.
- 컨테이너의 로컬 SQLite는 영속 볼륨이 없으면 재배포 시 보존되지 않는 MVP 저장소로
  간주한다.

## 6. API 계약

모든 `/api` 요청은 API 키가 구성된 환경에서 `X-API-Key` 헤더를 포함해야 한다.

| 메서드 | 경로 | 성공 응답 | 주요 제약 |
| --- | --- | --- | --- |
| `POST` | `/api/analyze` | SSE 스트림 | 회의록 1~20,000자, 외부 변경 없음 |
| `POST` | `/api/issues` | `CreateIssuesResponse` | `approved=true`, 초안 1개 이상 |
| `GET` | `/api/repos` | `RepoSummary[]` | 토큰 없으면 빈 배열 |
| `GET` | `/api/repos/resolve?q=` | `RepoSummary` | 리포 참조 정규화 |
| `GET` | `/api/repos/{owner}/{repo}/labels` | `LabelSummary[]` | GitHub 권한 필요 가능 |
| `GET` | `/api/repos/{owner}/{repo}/issues` | `GitHubIssueSummary[]` | `limit` 1~100, PR 제외 |
| `GET` | `/api/repos/{owner}/{repo}/pulls` | `GitHubPullRequestSummary[]` | `limit` 1~100 |
| `GET` | `/api/repos/{owner}/{repo}/pulls/{number}` | `GitHubPullRequestDetail` | 양의 PR 번호 |
| `POST` | `/api/repos/{owner}/{repo}/pulls/{number}/review` | `PullRequestReviewResponse` | GitHub에 게시하지 않음 |
| `GET` | `/api/history` | 이력 요약 배열 | `limit` 1~100 |
| `GET` | `/api/history/{analysis_id}` | 이력 상세 | 존재하지 않으면 `404` |
| `DELETE` | `/api/history/{analysis_id}` | 삭제 결과 | 존재하지 않으면 `404` |
| `GET` | `/health` | 상태 JSON | 인증 및 외부 호출 없음 |

### 6.1 분석 요청

```json
{
  "transcript": "회의록 본문",
  "repo": "owner/repo",
  "meeting_title": "스프린트 회의"
}
```

### 6.2 SSE 이벤트 순서

정상 흐름은 아래 순서를 따른다. `stage`와 `delta`는 여러 번 발생할 수 있다.

```text
start → (stage | delta)* → result → done
```

오류 흐름은 `error → done`으로 끝난다. 단, 클라이언트가 먼저 연결을 끊은 경우 서버는
`done`을 보내지 않는다.

| 이벤트 | 필수 데이터 |
| --- | --- |
| `start` | `analysis_id`, `repo`, `label_count` |
| `stage` | 단계명, 상태, 시도 횟수, 선택적 소요 시간/오류 |
| `delta` | 단계명, 부분 텍스트 |
| `result` | 요약, 결정, 초안, 검수 결과를 포함한 `AnalysisResult` |
| `error` | 사용자에게 표시할 메시지와 선택적 단계명 |
| `done` | `analysis_id` |

### 6.3 이슈 생성 요청

```json
{
  "repo": "owner/repo",
  "drafts": [],
  "approved": true,
  "analysis_id": "분석 ID"
}
```

- 서버는 `approved=false`를 GitHub 토큰 검사보다 먼저 `400`으로 거부해야 한다.
- 이슈 본문에는 AI 생성 고지, 완료 조건 체크리스트, 회의록 근거를 서버가 조합해야 한다.
- 응답은 `succeeded_count`, `failed_count`, 초안별 `results`를 포함해야 한다.

## 7. 설정 요구사항

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `ENVIRONMENT` | `local` | `local`, `dev`, `prod` |
| `CORS_ORIGINS` | 로컬 개발 주소 | 허용 오리진의 쉼표 구분 목록 |
| `API_KEY` | 빈 값 | `/api` 접근용 공유 키 |
| `GITHUB_TOKEN` | 빈 값 | 서버 측 GitHub PAT |
| `MODEL_PROVIDER` | 로컬 `copilot_sdk` | `azure_openai`, `copilot_sdk` |
| `MODEL_ID` | `gpt-4o` | 모델 또는 Azure 배포 이름 |
| `MODEL_TIMEOUT_S` | `60` | 모델 호출 제한 시간 |
| `MAX_RETRIES` | `2` | 단계별 재시도 횟수 |
| `STAGE_TIMEOUT_S` | `90` | 에이전트 단계 제한 시간 |
| `ISSUE_CREATE_CONCURRENCY` | `3` | 동시 이슈 생성 수 |
| `HISTORY_ENABLED` | `true` | 이력 기능 활성화 |
| `HISTORY_DB_PATH` | `data/history.db` | SQLite 파일 경로 |
| `PERSIST_TRANSCRIPT` | `false` | 회의록 원문 저장 동의 |
| `AZURE_OPENAI_ENDPOINT` | 빈 값 | Azure OpenAI 엔드포인트 |
| `AZURE_OPENAI_API_KEY` | 빈 값 | 비우면 관리 ID 사용 |
| `AZURE_KEY_VAULT_URL` | 빈 값 | 운영 비밀 저장소 |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | 빈 값 | 텔레메트리 활성화 |

운영 배포의 Bicep 기본 모델 공급자는 `azure_openai`여야 하며, 로컬에서는 Copilot SDK를
선택할 수 있다. 폐지된 `github_models`는 새 배포에서 허용하지 않는다.

## 8. 보안 및 개인정보 요구사항

### 8.1 인증과 권한

- 운영 환경에서 `API_KEY`가 비어 있으면 `/api` 요청을 허용하지 않아야 한다.
- API 키 비교는 타이밍 공격을 완화하는 안전한 비교 방식을 사용해야 한다.
- GitHub PAT는 필요한 최소 리포 권한만 가져야 한다.
- CORS, 데모 로그인, `approved` 필드를 사용자 인증 수단으로 간주하지 않는다.
- Azure에서는 관리 ID로 Key Vault, Azure OpenAI, ACR에 접근해야 한다.

### 8.2 비밀 관리

- 비밀을 코드, 이미지, 프론트엔드 번들 또는 로그에 기록하지 않는다.
- 운영의 `github-token`과 `api-key`는 Key Vault에 저장한다.
- Azure OpenAI는 가능하면 로컬 키 인증을 비활성화하고 Entra ID를 사용한다.
- 로그와 오류 응답에서 토큰, API 키, 전체 프롬프트를 마스킹해야 한다.

### 8.3 AI 안전

- 회의록의 명령문은 시스템 지시로 실행하지 않는다.
- 근거 없는 할 일을 생성하지 않는다.
- 존재하지 않는 GitHub 라벨과 담당자를 게시 전에 제거한다.
- 모든 생성 이슈에 AI 생성 사실과 사용자 검토 필요성을 표시한다.
- AI가 생성한 PR 리뷰는 자동 게시하지 않는다.

### 8.4 개인정보

- 회의록 원문 저장은 명시적 설정이 있을 때만 허용한다.
- 기본 로그에는 회의록 원문과 완성된 프롬프트를 남기지 않는다.
- 사용자는 분석 이력을 삭제할 수 있어야 한다.

## 9. 비기능 요구사항

| 분류 | 요구사항 |
| --- | --- |
| 성능 | 2,000자 회의록 분석을 60초 이내 완료하는 것을 목표로 한다. |
| 응답성 | 분석 시작과 단계 진행 상태를 SSE로 즉시 전달한다. |
| 제한 | 회의록은 최대 20,000자, PR diff는 기본 100,000자로 제한한다. |
| 가용성 | 리포 컨텍스트 조회 실패 시 라벨·담당자 없이 분석을 계속한다. |
| 복구성 | 에이전트 단계 재시도와 이슈 단위 부분 실패를 지원한다. |
| 확장성 | 모델 공급자와 에이전트 워크플로를 API 계층에서 분리한다. |
| 접근성 | 상태를 색상만으로 표현하지 않고 텍스트와 아이콘을 병행한다. |
| 호환성 | 최신 데스크톱 및 모바일 브라우저의 반응형 UI를 지원한다. |
| 유지보수성 | 프론트와 백엔드의 타입/스키마를 명시하고 컴포넌트 책임을 분리한다. |

## 10. 오류 처리

| 상황 | 서버 동작 | 클라이언트 동작 |
| --- | --- | --- |
| 유효하지 않은 입력 | `422`와 필드 오류 반환 | 수정 가능한 오류 표시 |
| API 키 누락/불일치 | `401` 또는 운영 잠금 오류 | 인증 설정 안내 |
| 모델 설정 누락 | SSE `error` 또는 PR 리뷰 `503` | 재시도 대신 설정 오류 표시 |
| 모델 출력 스키마 오류 | 단계 재시도 후 실패 이벤트 | 실패 단계와 재시도 안내 |
| GitHub 인증 실패 | `401`/`403` 보존 | 권한 확인 안내 |
| GitHub 업스트림 실패 | 원본 상태 또는 `502` | 전체/항목 실패 구분 |
| 라벨·담당자 `422` | 해당 필드 제외 후 1회 재시도 | 최종 결과만 표시 |
| 이슈 일부 생성 실패 | 성공과 실패를 함께 `200` 응답 | 재시도할 항목만 구분 |
| SSE 연결 중단 | 분석과 출력 즉시 중단 | 사용자가 다시 분석 가능 |
| 이력 저장 실패 | 핵심 요청 성공 유지, 경고 로그 | 별도 성공으로 오인하지 않음 |

## 11. 관찰성

- 로그는 환경, 모델 공급자, 분석 ID, 단계명, 시도 횟수, 소요 시간을 구조적으로 포함한다.
- 회의록 원문, 비밀 값, 전체 모델 입력은 기록하지 않는다.
- App Insights에서 다음 항목을 확인할 수 있어야 한다.
  - 요청 수, 상태 코드, 지연 시간
  - 에이전트 단계별 지연 시간과 실패율
  - 모델 공급자별 오류
  - GitHub API 오류와 이슈 생성 성공/실패 수
- `/health`는 `status`, `environment`, `provider`, GitHub 토큰 구성 여부를 반환한다.
- 헬스 체크는 모델, GitHub, Key Vault 장애 때문에 실패하지 않아야 한다.

## 12. 배포 아키텍처

Azure 리소스는 `backend/infra/main.bicep`에서 선언한다.

| 리소스 | 역할 | 필수 설정 |
| --- | --- | --- |
| Container Apps | FastAPI 실행 | 외부 ingress, 포트 8000, 단일 활성 리비전 |
| Azure Container Registry | 이미지 저장 | 관리자 계정 비활성화, 관리 ID Pull |
| User Assigned Identity | 워크로드 신원 | Key Vault/OpenAI/ACR RBAC |
| Key Vault | PAT와 API 키 저장 | RBAC, soft delete |
| Azure OpenAI | 모델 추론 | 로컬 키 인증 비활성화, 관리 ID 접근 |
| App Insights | 애플리케이션 관찰성 | 연결 문자열 주입 |
| Log Analytics | 로그 백엔드 | 30일 보존 |

배포 요구사항:

- Bicep 배포는 같은 입력에 대해 반복 실행 가능해야 한다.
- 컨테이너는 `0.5 CPU`, `1 GiB`를 MVP 기준값으로 사용한다.
- 데모 안정성을 위해 최소 복제본 수를 1로 유지한다.
- `/health` 기반 liveness 및 readiness probe를 구성한다.
- 운영 CORS 오리진과 API 키를 배포 입력으로 명시해야 한다.
- 이미지 Pull, Key Vault 읽기, Azure OpenAI 호출에 비밀번호 없는 인증을 사용한다.

## 13. 테스트 및 품질 게이트

### 13.1 백엔드

- 단위·API 테스트는 모델과 GitHub 호출을 모킹해 네트워크 없이 실행되어야 한다.
- 최소 검증 범위:
  - 입력 및 리포 참조 검증
  - SSE 정상/오류/연결 중단 이벤트 순서
  - 세 에이전트의 순차 데이터 전달
  - 단계 재시도와 최종 실패
  - 승인 없는 이슈 생성 거부
  - 라벨·담당자 정제와 `422` 재시도
  - 이슈 생성 부분 실패 응답
  - 회의록 비저장 기본값과 이력 삭제
  - API 키의 로컬/운영 동작
  - 읽기 전용 PR 리뷰와 diff 길이 제한
- `pytest -q`와 `ruff check app tests`를 통과해야 한다.

### 13.2 프론트엔드

- `npm run build`와 `npm run lint`를 통과해야 한다.
- 분석 중단, SSE 오류, 빈 결과, 부분 생성 실패를 UI에서 확인해야 한다.
- 데스크톱과 모바일 너비에서 입력→분석→검토→생성 플로우가 완료되어야 한다.
- 키보드만으로 주요 동작을 실행할 수 있어야 한다.

### 13.3 배포 검증

- Bicep 배포 후 `/health`가 정상 응답해야 한다.
- 허용된 오리진과 올바른 API 키로만 `/api`에 접근할 수 있어야 한다.
- 관리 ID로 Key Vault 및 Azure OpenAI 접근이 가능해야 한다.
- App Insights에서 요청 및 에이전트 단계 텔레메트리를 확인해야 한다.
- 테스트 리포에서 분석→승인→이슈 생성의 엔드투엔드 흐름을 완료해야 한다.

## 14. 요구사항 추적성

| PRD 요구사항 | 기술 구현 |
| --- | --- |
| F1 리포 선택 | GitHub 리포 조회 API, 프론트 `localStorage` 최근 리포 |
| F2 이슈 목록 | 열린 이슈 조회 API와 리포 화면 |
| F3 회의록 입력 | `AnalyzeRequest`, 20,000자 검증 |
| F4 추출 에이전트 | `ExtractionResult`, 근거 필수, `stage`/`delta` |
| F5 정리 에이전트 | `IssueDraft`, AC, 실제 라벨·담당자 정제 |
| F6 검수 에이전트 | `ReviewFinding`, 누락·중복·모호성 분류 |
| F7 승인 UI | 초안 수정·선택·제외, 서버 `approved` 게이트 |
| F8 이슈 생성 | 제한된 병렬 생성, 항목별 결과와 부분 실패 |
| F9 이력 | SQLite 요약 저장, 상세 조회 및 삭제 |
| E1~E2 PR 조회 | PR 목록·상세 API |
| E3~E5 AI 리뷰 | 읽기 전용 `PullRequestReviewer`, 구조화 finding |
| E6 게시 | MVP 제외, 서버 자동 게시 금지 |

## 15. 알려진 제약과 후속 과제

- 서버 측 공유 PAT와 API 키 방식은 데모/MVP용이다. 다중 사용자 운영 전 GitHub App 또는
  사용자별 OAuth 권한 모델로 전환해야 한다.
- 프론트엔드 빌드에 포함되는 `VITE_API_KEY`는 비밀로 보호할 수 없다. 공개 운영에서는
  백엔드 프록시, 사용자 인증 또는 단기 토큰 방식으로 대체해야 한다.
- Container Apps 로컬 파일 시스템의 SQLite는 영속성과 수평 확장을 보장하지 않는다.
  운영 이력이 필요하면 관리형 데이터베이스 또는 영속 스토리지로 이전해야 한다.
- SSE는 재연결 시 중간 상태 복구를 제공하지 않는다. 장시간 작업 또는 재개 기능이
  필요해지면 작업 큐와 상태 조회 API를 도입해야 한다.
- PR 리뷰 게시 기능을 추가할 때도 항목별 사용자 선택과 최종 승인 게이트를 유지해야 한다.
