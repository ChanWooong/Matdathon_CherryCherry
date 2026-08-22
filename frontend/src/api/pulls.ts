import type { PullRequest } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import { SEED_PULLS } from './mock/fixtures';

export async function listPulls(repoId: number): Promise<PullRequest[]> {
  if (IS_MOCK) {
    await delay(420);
    return SEED_PULLS[repoId] ?? [];
  }
  return request<PullRequest[]>(`/repos/${repoId}/pulls`);
}

export async function getPull(repoId: number, number: number): Promise<PullRequest> {
  if (IS_MOCK) {
    await delay(240);
    const found = (SEED_PULLS[repoId] ?? []).find((p) => p.number === number);
    if (!found) throw new Error('PR 을 찾을 수 없습니다.');
    return found;
  }
  return request<PullRequest>(`/repos/${repoId}/pulls/${number}`);
}

/** AI 리뷰 결과를 PR 코멘트로 남긴다. */
export async function postPullComment(repoId: number, number: number, body: string): Promise<void> {
  if (IS_MOCK) {
    await delay(600);
    return;
  }
  await request<void>(`/repos/${repoId}/pulls/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
