import type { Draft, PullRequest, ReviewEvent, ReviewFinding, StreamEvent } from '../../types';
import { extractFromText, reviewDrafts, tasksToDrafts } from './extract';

/**
 * 백엔드 SSE 를 흉내내는 목 스트림.
 * 실제 서버와 이벤트 순서·모양을 똑같이 맞춰 화면 코드가 바뀌지 않게 한다.
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function typeOut(
  text: string,
  agent: 'extractor' | 'composer' | 'reviewer',
  emit: (e: StreamEvent) => void,
  signal?: AbortSignal,
) {
  for (const chunk of text.match(/.{1,7}/gs) ?? []) {
    if (signal?.aborted) return;
    emit({ type: 'token', agent, text: chunk });
    await sleep(18);
  }
}

export async function mockIssuePipeline(
  meetingText: string,
  meetingId: string | undefined,
  emit: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const t0 = Date.now();

  /* 1. 추출 ------------------------------------------------------------- */
  emit({ type: 'agent_start', agent: 'extractor' });
  await typeOut('회의록을 훑어 결정사항과 할 일을 가려내는 중', 'extractor', emit, signal);
  if (signal?.aborted) return;

  const { decisions, tasks, participants } = extractFromText(meetingText);
  emit({ type: 'decisions', items: decisions });
  await sleep(180);
  emit({ type: 'tasks', items: tasks });
  emit({
    type: 'agent_done',
    agent: 'extractor',
    ms: Date.now() - t0,
    note: `결정 ${decisions.length}건 · 할 일 ${tasks.length}건${participants.length ? ` · 참석자 ${participants.length}명` : ''}`,
  });

  if (tasks.length === 0) {
    emit({ type: 'error', agent: 'extractor', message: '할 일로 볼 만한 문장을 찾지 못했습니다. 회의록에 항목을 불릿으로 적어 주세요.' });
    emit({ type: 'done' });
    return;
  }

  /* 2. 정리 ------------------------------------------------------------- */
  const t1 = Date.now();
  emit({ type: 'agent_start', agent: 'composer' });
  const drafts: Draft[] = tasksToDrafts(tasks, meetingId);

  for (let i = 0; i < drafts.length; i += 1) {
    if (signal?.aborted) return;
    emit({
      type: 'progress',
      agent: 'composer',
      note: `${i + 1}번째 초안 작성 중 · ${drafts[i].title}`,
      progress: Math.round(((i + 1) / drafts.length) * 100),
    });
    await sleep(260);
  }
  emit({ type: 'drafts', items: drafts });
  emit({ type: 'agent_done', agent: 'composer', ms: Date.now() - t1, note: `초안 ${drafts.length}건 작성` });

  /* 3. 검수 ------------------------------------------------------------- */
  const t2 = Date.now();
  emit({ type: 'agent_start', agent: 'reviewer' });
  await typeOut('기한·담당자·중복을 대조하는 중', 'reviewer', emit, signal);
  if (signal?.aborted) return;

  const review = reviewDrafts(drafts);
  const flagged = review.filter((r) => r.warnings.length > 0).length;
  emit({ type: 'review', items: review });
  emit({
    type: 'agent_done',
    agent: 'reviewer',
    ms: Date.now() - t2,
    note: flagged > 0 ? `${flagged}건에 확인이 필요합니다` : '이상 없음',
  });

  emit({ type: 'done' });
}

/* ----------------------------- PR AI 리뷰 -------------------------------- */

function findingsFor(pr: PullRequest): Record<'requirements' | 'quality' | 'summary', ReviewFinding[]> {
  const big = pr.additions + pr.deletions > 150;
  const hasIssue = pr.linkedIssue !== null;
  const checklist = (pr.body ?? '').match(/- \[( |x)\]/g) ?? [];
  const unchecked = checklist.filter((c) => c === '- [ ]').length;

  return {
    requirements: [
      hasIssue
        ? { id: 'r1', status: 'pass', text: `연결된 이슈 #${pr.linkedIssue} 의 목적과 변경 내용이 일치합니다.`, ref: `#${pr.linkedIssue}` }
        : { id: 'r1', status: 'warn', text: '연결된 이슈가 없습니다. 어떤 요구사항을 만족하는 변경인지 본문에 적어 주세요.' },
      unchecked > 0
        ? { id: 'r2', status: 'fail', text: `본문 체크리스트에 아직 확인되지 않은 항목이 ${unchecked}개 있습니다.` }
        : { id: 'r2', status: 'pass', text: '본문 체크리스트가 모두 확인되었습니다.' },
      { id: 'r3', status: 'info', text: `${pr.head} → ${pr.base} 로 머지됩니다. 대상 브랜치를 확인해 주세요.` },
    ],
    quality: [
      big
        ? { id: 'q1', status: 'warn', text: `변경량이 ${pr.additions + pr.deletions}줄, ${pr.changedFiles}개 파일입니다. 리뷰 단위를 나누면 검토가 빨라집니다.` }
        : { id: 'q1', status: 'pass', text: `변경량이 ${pr.additions + pr.deletions}줄로 한 번에 검토하기 알맞습니다.` },
      { id: 'q2', status: 'warn', text: '변경된 동작을 덮는 테스트가 보이지 않습니다. 회귀 테스트를 추가해 주세요.' },
      { id: 'q3', status: 'pass', text: '기존 공개 API 시그니처를 바꾸지 않아 호환성 문제는 없습니다.' },
      pr.draft
        ? { id: 'q4', status: 'info', text: '초안(draft) 상태입니다. 머지 전 리뷰 요청으로 전환해 주세요.' }
        : { id: 'q4', status: 'pass', text: '리뷰 가능한 상태입니다.' },
    ],
    summary: [
      { id: 's1', status: 'info', text: `${pr.title} — ${pr.changedFiles}개 파일에서 +${pr.additions} / -${pr.deletions}.` },
      { id: 's2', status: 'info', text: '핵심 변경은 입력 처리 경로이며, 나머지는 그에 따른 테스트·문서 반영입니다.' },
      { id: 's3', status: 'info', text: '리뷰어는 입력 경계값과 예외 처리부터 보면 됩니다.' },
    ],
  };
}

export async function mockPrReview(
  pr: PullRequest,
  emit: (e: ReviewEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const all = findingsFor(pr);
  const order: ('requirements' | 'quality' | 'summary')[] = ['requirements', 'quality', 'summary'];

  for (const agent of order) {
    if (signal?.aborted) return;
    const t = Date.now();
    emit({ type: 'agent_start', agent });
    await sleep(520 + Math.random() * 420);
    if (signal?.aborted) return;
    emit({ type: 'findings', agent, items: all[agent] });
    emit({
      type: 'agent_done',
      agent,
      ms: Date.now() - t,
      note: `${all[agent].length}개 항목`,
    });
  }
  emit({ type: 'done' });
}
