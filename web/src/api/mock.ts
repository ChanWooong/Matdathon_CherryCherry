import type {
  CreateResult, Draft, Issue, PullRequest, Repo, ReviewEvent, ReviewFinding, StreamEvent,
} from '../types';
import { ISSUES, PRS, REPOS } from './fixtures';
import { extractFromText, reviewDrafts, tasksToDrafts } from './extract';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** 문자열을 토큰 단위로 쪼개 스트리밍처럼 흘려보낸다. */
async function* streamText(
  agent: 'extractor' | 'composer' | 'reviewer',
  text: string,
  signal: AbortSignal,
  charsPerTick = 6,
  tick = 18,
): AsyncGenerator<StreamEvent> {
  for (let i = 0; i < text.length; i += charsPerTick) {
    await sleep(tick, signal);
    yield { type: 'token', agent, text: text.slice(i, i + charsPerTick) };
  }
}

export async function listRepos(): Promise<Repo[]> {
  await sleep(180);
  return REPOS;
}

export async function listIssues(repo: string): Promise<Issue[]> {
  await sleep(220);
  return ISSUES[repo] ?? [];
}

export async function listPullRequests(repo: string): Promise<PullRequest[]> {
  await sleep(220);
  return PRS[repo] ?? [];
}

export async function* analyze(
  input: { repo: string; text: string },
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const { repo, text } = input;

  // ── 1. 추출 에이전트 ──────────────────────────────
  const t0 = performance.now();
  yield { type: 'agent_start', agent: 'extractor' };
  await sleep(350, signal);

  let { decisions, tasks } = extractFromText(text);
  if (tasks.length === 0) {
    tasks = [{
      title: '회의 후속 작업 정리',
      assignee: null,
      due: null,
      evidence: text.slice(0, 80),
    }];
  }

  const extractLog = [
    `결정사항 ${decisions.length}건`,
    ...decisions.map((d) => `  • ${d.text}`),
    '',
    `할 일 ${tasks.length}건`,
    ...tasks.map((t, i) =>
      `  ${i + 1}. ${t.title}${t.assignee ? ` · @${t.assignee}` : ' · 담당자 미상'}${t.due ? ` · ${t.due}` : ''}`),
    '',
  ].join('\n');

  yield* streamText('extractor', extractLog, signal, 5, 14);
  yield { type: 'decisions', items: decisions };
  yield { type: 'tasks', items: tasks };
  yield {
    type: 'agent_done',
    agent: 'extractor',
    ms: Math.round(performance.now() - t0),
    note: `결정 ${decisions.length}건 · 할 일 ${tasks.length}건 추출`,
  };

  // ── 2. 정리 에이전트 ──────────────────────────────
  const t1 = performance.now();
  yield { type: 'agent_start', agent: 'composer' };
  const drafts: Draft[] = tasksToDrafts(tasks, repo);

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    yield {
      type: 'progress',
      agent: 'composer',
      note: `이슈 초안 ${i + 1}/${drafts.length} 생성 중…`,
      progress: (i + 1) / drafts.length,
    };
    const block = [
      `[초안 ${i + 1}] ${d.title}`,
      `  라벨: ${d.labels.join(', ')} · 담당: ${d.assignee ? `@${d.assignee}` : '—'} · 기한: ${d.due ?? '—'}`,
      '  완료 조건:',
      ...d.ac.map((a) => `    - ${a.text}`),
      '',
    ].join('\n');
    yield* streamText('composer', block, signal, 7, 12);
  }

  yield { type: 'drafts', items: drafts };
  yield {
    type: 'agent_done',
    agent: 'composer',
    ms: Math.round(performance.now() - t1),
    note: `이슈 초안 ${drafts.length}건 생성`,
  };

  // ── 3. 검수 에이전트 ──────────────────────────────
  const t2 = performance.now();
  yield { type: 'agent_start', agent: 'reviewer' };
  await sleep(300, signal);

  const review = reviewDrafts(drafts);
  const total = review.reduce((n, r) => n + r.warnings.length, 0);
  const reviewLog = total === 0
    ? '검수 통과 — 지적사항 없음\n'
    : [
      `지적사항 ${total}건`,
      ...review.flatMap((r) => {
        const d = drafts.find((x) => x.id === r.draftId)!;
        return r.warnings.map((w) => `  ⚠️ [${d.title}] ${w}`);
      }),
      '',
    ].join('\n');

  yield* streamText('reviewer', reviewLog, signal, 5, 14);
  yield { type: 'review', items: review };
  yield {
    type: 'agent_done',
    agent: 'reviewer',
    ms: Math.round(performance.now() - t2),
    note: total === 0 ? '지적사항 없음' : `지적사항 ${total}건`,
  };

  yield { type: 'done' };
}

export async function createIssues(repo: string, drafts: Draft[]): Promise<CreateResult[]> {
  const out: CreateResult[] = [];
  let next = 43;
  for (const d of drafts) {
    await sleep(320);
    out.push({
      draftId: d.id,
      ok: true,
      number: next,
      url: `https://github.com/${repo}/issues/${next}`,
      title: d.title,
    });
    next += 1;
  }
  return out;
}

export async function* reviewPullRequest(
  _repo: string,
  pr: PullRequest,
  signal: AbortSignal,
): AsyncGenerator<ReviewEvent> {
  const start = performance.now();

  yield { type: 'agent_start', agent: 'requirements' };
  yield { type: 'agent_start', agent: 'quality' };
  yield { type: 'agent_start', agent: 'summary' };

  await sleep(1400, signal);
  const reqFindings: ReviewFinding[] = pr.linkedIssue
    ? [
      { id: 'r1', status: 'pass', text: '토큰 만료 시 401 반환', ref: 'auth.ts:42' },
      { id: 'r2', status: 'fail', text: '리프레시 토큰 재발급 동작', ref: '관련 변경 없음' },
    ]
    : [{ id: 'r0', status: 'info', text: '연결된 이슈가 없어 대조할 완료 조건이 없습니다' }];
  yield { type: 'findings', agent: 'requirements', items: reqFindings };
  yield {
    type: 'agent_done',
    agent: 'requirements',
    ms: Math.round(performance.now() - start),
    note: pr.linkedIssue ? `이슈 #${pr.linkedIssue}의 완료 조건 대조` : '연결 이슈 없음',
  };

  await sleep(700, signal);
  yield {
    type: 'findings',
    agent: 'quality',
    items: [
      { id: 'q1', status: 'warn', text: '에러 케이스에서 토큰이 로그에 노출됩니다', ref: 'auth.ts:57' },
      { id: 'q2', status: 'info', text: '중복 상수 — 상수 파일로 분리 권장', ref: 'auth.ts:12' },
    ],
  };
  yield { type: 'agent_done', agent: 'quality', ms: Math.round(performance.now() - start), note: '2건 지적' };

  await sleep(900, signal);
  yield {
    type: 'findings',
    agent: 'summary',
    items: [
      { id: 's1', status: 'info', text: `${pr.title} — 인증 미들웨어에 만료 검사와 401 응답 경로를 추가했습니다.` },
      { id: 's2', status: 'info', text: `변경 규모 +${pr.additions} / −${pr.deletions}, 핵심 변경은 auth 모듈에 집중되어 있습니다.` },
      { id: 's3', status: 'info', text: '학습 포인트 — 만료 검증을 미들웨어 단일 지점에 두면 라우트별 중복 검사를 피할 수 있습니다.' },
    ],
  };
  yield { type: 'agent_done', agent: 'summary', ms: Math.round(performance.now() - start) };

  yield { type: 'done' };
}

export async function postPrComment(_repo: string, pr: number): Promise<{ url: string }> {
  await sleep(500);
  return { url: `#comment-on-pr-${pr}` };
}
