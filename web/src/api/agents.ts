import type { PullRequest, ReviewEvent, StreamEvent } from '../types';
import { streamEvents } from './client';
import { IS_MOCK } from './config';
import { mockIssuePipeline, mockPrReview } from './mock/agents.mock';

/**
 * 회의록 → 이슈 초안 파이프라인 (추출 → 정리 → 검수).
 * mock/live 어느 쪽이든 같은 이벤트를 같은 순서로 흘려보낸다.
 */
export function runIssuePipeline(
  input: { meetingText: string; meetingId?: string; repoId: number },
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (IS_MOCK) {
    return mockIssuePipeline(input.meetingText, input.meetingId, onEvent, signal);
  }
  return streamEvents<StreamEvent>('/agents/issues/stream', input, onEvent, signal);
}

/** PR 본문·변경 내역을 읽고 리뷰 초안을 만든다. */
export function runPrReview(
  repoId: number,
  pr: PullRequest,
  onEvent: (e: ReviewEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (IS_MOCK) {
    return mockPrReview(pr, onEvent, signal);
  }
  return streamEvents<ReviewEvent>(
    '/agents/review/stream',
    { repoId, number: pr.number },
    onEvent,
    signal,
  );
}
