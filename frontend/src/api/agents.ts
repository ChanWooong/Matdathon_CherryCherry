import type {
  Draft,
  PullRequest,
  ReviewEvent,
  ReviewFinding,
  StreamEvent,
} from '../types';
import { request, streamEvents } from './client';
import { IS_MOCK } from './config';
import { mockIssuePipeline, mockPrReview } from './mock/agents.mock';
import { requireRepo } from './repos';

type ApiStage = 'extract' | 'compose' | 'review';
type UiAgent = 'extractor' | 'composer' | 'reviewer';

interface ApiStageEvent {
  stage: ApiStage;
  status: 'running' | 'done' | 'failed';
  label?: string;
  duration_ms?: number | null;
}

interface ApiAnalysisResult {
  analysis_id: string;
  decisions: Array<{ statement: string; evidence: string }>;
  drafts: Array<{
    draft_id: string;
    title: string;
    body: string;
    acceptance_criteria: Array<{ id: string; text: string }>;
    labels: string[];
    assignees: string[];
    evidence: string;
  }>;
  findings: Array<{
    draft_id?: string | null;
    severity: 'blocker' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
  verdict?: string;
}

interface ApiPrReview {
  posted_to_github?: false;
  summary?: string;
  verdict?: string;
  findings?: Array<{
    severity?: string;
    title?: string;
    message?: string;
    suggestion?: string;
    file?: string | null;
    line?: number | null;
  }>;
}

const STAGE_AGENT: Record<ApiStage, UiAgent> = {
  extract: 'extractor',
  compose: 'composer',
  review: 'reviewer',
};

function toDraft(draft: ApiAnalysisResult['drafts'][number], meetingId?: string): Draft {
  return {
    id: draft.draft_id,
    title: draft.title,
    body: draft.body,
    labels: draft.labels,
    assignee: draft.assignees[0] ?? null,
    due: null,
    ac: draft.acceptance_criteria.map((criterion) => ({ text: criterion.text, done: false })),
    evidence: draft.evidence,
    selected: true,
    warnings: [],
    meetingId,
  };
}

function emitResult(
  result: ApiAnalysisResult,
  meetingId: string | undefined,
  emit: (event: StreamEvent) => void,
) {
  emit({
    type: 'decisions',
    items: result.decisions.map((decision) => ({ text: decision.statement })),
  });
  emit({ type: 'drafts', items: result.drafts.map((draft) => toDraft(draft, meetingId)) });
  emit({
    type: 'review',
    items: result.drafts.map((draft) => ({
      draftId: draft.draft_id,
      warnings: result.findings
        .filter((finding) => finding.draft_id === draft.draft_id)
        .map((finding) => finding.suggestion
          ? `${finding.message} — ${finding.suggestion}`
          : finding.message),
    })),
  });
}

/** FastAPI의 named SSE 이벤트를 화면의 에이전트 이벤트로 변환한다. */
export function runIssuePipeline(
  input: { meetingText: string; meetingId?: string; repoId: number },
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (IS_MOCK) {
    return mockIssuePipeline(input.meetingText, input.meetingId, onEvent, signal);
  }
  const repo = requireRepo(input.repoId);
  let active: UiAgent = 'extractor';

  return streamEvents(
    '/analyze',
    {
      transcript: input.meetingText,
      repo: repo.fullName,
      meeting_title: input.meetingId,
    },
    (event, data) => {
      if (event === 'stage') {
        const stage = data as ApiStageEvent;
        active = STAGE_AGENT[stage.stage];
        if (stage.status === 'running') {
          onEvent({ type: 'agent_start', agent: active });
        } else if (stage.status === 'done') {
          onEvent({
            type: 'agent_done',
            agent: active,
            ms: stage.duration_ms ?? 0,
            note: stage.label ?? '완료',
          });
        } else {
          onEvent({ type: 'error', agent: active, message: stage.label ?? '단계 실행에 실패했습니다.' });
        }
      } else if (event === 'delta') {
        const delta = data as { stage: ApiStage; text: string };
        onEvent({ type: 'token', agent: STAGE_AGENT[delta.stage], text: delta.text });
      } else if (event === 'result') {
        emitResult(data as ApiAnalysisResult, input.meetingId, onEvent);
      } else if (event === 'error') {
        const error = data as { stage?: ApiStage | null; message: string };
        onEvent({
          type: 'error',
          agent: error.stage ? STAGE_AGENT[error.stage] : active,
          message: error.message,
        });
      } else if (event === 'done') {
        onEvent({ type: 'done' });
      }
    },
    signal,
  );
}

function findingStatus(severity?: string): ReviewFinding['status'] {
  if (severity === 'blocker' || severity === 'critical' || severity === 'error') return 'fail';
  if (severity === 'warning' || severity === 'warn') return 'warn';
  if (severity === 'pass') return 'pass';
  return 'info';
}

/** 구조화된 서버 응답을 기존 검토 UI의 세 구역으로 나눠 표시한다. */
export async function runPrReview(
  repoId: number,
  pr: PullRequest,
  onEvent: (event: ReviewEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (IS_MOCK) return mockPrReview(pr, onEvent, signal);
  const repo = requireRepo(repoId);
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls/${pr.number}/review`;
  const started = performance.now();

  onEvent({ type: 'agent_start', agent: 'requirements' });
  const review = await request<ApiPrReview>(path, { method: 'POST', signal });
  const requirements: ReviewFinding[] = [{
    id: 'verdict',
    status: review.verdict === 'approve' ? 'pass' : review.verdict === 'request_changes' ? 'fail' : 'warn',
    text: `AI 검토 판정: ${review.verdict ?? 'comment'}`,
  }];
  onEvent({ type: 'findings', agent: 'requirements', items: requirements });
  onEvent({
    type: 'agent_done',
    agent: 'requirements',
    ms: Math.round(performance.now() - started),
    note: `${requirements.length}개 항목`,
  });

  onEvent({ type: 'agent_start', agent: 'quality' });
  const findings: ReviewFinding[] = (review.findings ?? []).map((finding, index) => ({
    id: `finding-${index}`,
    status: findingStatus(finding.severity),
    text: [finding.title, finding.message, finding.suggestion].filter(Boolean).join(' — ') || '검토 의견',
    ref: finding.file
      ? `${finding.file}${finding.line ? `:${finding.line}` : ''}`
      : undefined,
  }));
  onEvent({ type: 'findings', agent: 'quality', items: findings });
  onEvent({ type: 'agent_done', agent: 'quality', ms: 0, note: `${findings.length}개 항목` });

  onEvent({ type: 'agent_start', agent: 'summary' });
  const summary = [
    review.summary,
    review.posted_to_github === false ? '검토 결과는 GitHub에 자동 게시되지 않았습니다.' : undefined,
  ].filter(Boolean) as string[];
  onEvent({
    type: 'findings',
    agent: 'summary',
    items: summary.map((text, index) => ({ id: `summary-${index}`, status: 'info', text })),
  });
  onEvent({ type: 'agent_done', agent: 'summary', ms: 0, note: '검토용 초안 생성' });
  onEvent({ type: 'done' });
}
