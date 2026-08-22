import type { Repo } from '../types';
import { ApiError, request } from './client';
import { IS_MOCK, delay } from './config';
import * as db from './mock/db';
import { AVAILABLE_REPOS } from './mock/fixtures';

interface ApiRepo {
  id?: number;
  full_name: string;
  name: string;
  owner: string;
  private?: boolean;
  description?: string | null;
  default_branch?: string;
  language?: string | null;
  html_url?: string;
  open_issues_count?: number;
  open_pulls_count?: number;
  pushed_at?: string | null;
  updated_at?: string | null;
}

function stableId(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toRepo(repo: ApiRepo): Repo {
  return {
    id: repo.id ?? stableId(repo.full_name),
    owner: repo.owner,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? '',
    language: repo.language ?? null,
    private: repo.private ?? false,
    defaultBranch: repo.default_branch ?? 'main',
    updatedAt: repo.updated_at ?? repo.pushed_at ?? new Date(0).toISOString(),
    openIssues: repo.open_issues_count ?? 0,
    openPulls: repo.open_pulls_count ?? 0,
  };
}

function normalizeRepoQuery(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('GitHub 링크 또는 owner/repo를 입력해 주세요.');
  return value;
}

/** GitHub 계정에서 접근할 수 있는 레포지토리. */
export async function listAvailableRepos(): Promise<Repo[]> {
  if (IS_MOCK) {
    await delay(150);
    db.saveAvailableRepos(AVAILABLE_REPOS);
    return AVAILABLE_REPOS;
  }
  let raw: ApiRepo[];
  try {
    raw = await request<ApiRepo[]>('/repos');
  } catch (error) {
    // 토큰이 없는 환경에서는 전체 목록 대신 링크 검색만 사용한다.
    if (error instanceof ApiError && error.status === 401) return [];
    throw error;
  }
  const repos = raw.map(toRepo);
  db.saveAvailableRepos(repos);
  return repos;
}

/** GitHub 링크(owner/repo 포함)로 특정 레포지토리를 조회한다. */
export async function resolveRepo(input: string): Promise<Repo> {
  const query = normalizeRepoQuery(input);
  if (IS_MOCK) {
    await delay(120);
    const key = query
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\/+$/, '')
      .split('/')
      .slice(0, 2)
      .join('/')
      .replace(/\.git$/i, '');
    const found = db.get().availableRepos.find((repo) => repo.fullName.toLowerCase() === key.toLowerCase());
    if (!found) throw new Error('해당 링크의 레포지토리를 찾지 못했습니다.');
    return found;
  }

  const resolved = toRepo(
    await request<ApiRepo>(`/repos/resolve?q=${encodeURIComponent(query)}`),
  );
  db.upsertAvailableRepo(resolved);
  return resolved;
}

/** 프로젝트 구성은 MVP에서 브라우저에 저장하고 GitHub 데이터만 서버에서 가져온다. */
export async function listProjectRepos(projectId: string): Promise<Repo[]> {
  await delay(60);
  const row = db.get().projects.find((project) => project.id === projectId);
  if (!row) return [];
  return row.repoIds.map((id) => db.findRepo(id)).filter((repo): repo is Repo => Boolean(repo));
}

export async function getProjectRepo(projectId: string, repoId: number): Promise<Repo> {
  const repos = await listProjectRepos(projectId);
  const found = repos.find((repo) => repo.id === repoId);
  if (!found) throw new Error('이 프로젝트에 등록되지 않은 레포지토리입니다.');
  return found;
}

export async function addRepos(projectId: string, repoIds: number[]): Promise<Repo[]> {
  await delay(100);
  db.update((state) => {
    const row = state.projects.find((project) => project.id === projectId);
    if (!row) throw new Error('프로젝트를 찾을 수 없습니다.');
    for (const id of repoIds) if (!row.repoIds.includes(id)) row.repoIds.push(id);
  });
  return listProjectRepos(projectId);
}

export async function removeRepo(projectId: string, repoId: number): Promise<void> {
  await delay(60);
  db.update((state) => {
    const row = state.projects.find((project) => project.id === projectId);
    if (row) row.repoIds = row.repoIds.filter((id) => id !== repoId);
  });
}

export function requireRepo(repoId: number): Repo {
  const repo = db.findRepo(repoId);
  if (!repo) throw new Error('레포지토리 정보를 찾을 수 없습니다. 프로젝트에서 다시 추가해 주세요.');
  return repo;
}
