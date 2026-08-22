import type { PullRequest } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import { SEED_PULLS } from './mock/fixtures';
import { requireRepo } from './repos';

interface ApiPull {
  number: number;
  title: string;
  body?: string | null;
  state: 'open' | 'closed' | 'merged';
  draft?: boolean;
  user?: { login: string };
  head_ref?: string;
  base_ref?: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  linked_issue?: number | null;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  url?: string;
  merged?: boolean;
}

function toPull(pull: ApiPull): PullRequest {
  return {
    number: pull.number,
    title: pull.title,
    body: pull.body ?? '',
    author: pull.user?.login ?? 'unknown',
    state: pull.merged ? 'merged' : pull.state,
    draft: pull.draft ?? false,
    head: pull.head_ref ?? '',
    base: pull.base_ref ?? '',
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changedFiles: pull.changed_files ?? 0,
    linkedIssue: pull.linked_issue ?? null,
    createdAt: pull.created_at ?? new Date(0).toISOString(),
    updatedAt: pull.updated_at ?? pull.created_at ?? new Date(0).toISOString(),
    url: pull.html_url ?? pull.url ?? '#',
  };
}

export async function listPulls(repoId: number): Promise<PullRequest[]> {
  if (IS_MOCK) {
    await delay(180);
    return SEED_PULLS[repoId] ?? [];
  }
  const repo = requireRepo(repoId);
  return (await request<ApiPull[]>(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`,
  )).map(toPull);
}

export async function getPull(repoId: number, number: number): Promise<PullRequest> {
  if (IS_MOCK) {
    await delay(120);
    const found = (SEED_PULLS[repoId] ?? []).find((pull) => pull.number === number);
    if (!found) throw new Error('PR을 찾을 수 없습니다.');
    return found;
  }
  const repo = requireRepo(repoId);
  return toPull(await request<ApiPull>(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls/${number}`,
  ));
}
