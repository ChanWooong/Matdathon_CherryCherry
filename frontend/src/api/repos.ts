import type { Repo } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import * as db from './mock/db';
import { AVAILABLE_REPOS } from './mock/fixtures';

/** GitHub 계정에서 고를 수 있는 전체 레포 */
export async function listAvailableRepos(): Promise<Repo[]> {
  if (IS_MOCK) {
    await delay(300);
    return AVAILABLE_REPOS;
  }
  return request<Repo[]>('/github/repos');
}

/** 프로젝트에 등록된 레포 */
export async function listProjectRepos(projectId: string): Promise<Repo[]> {
  if (IS_MOCK) {
    await delay(180);
    const row = db.get().projects.find((p) => p.id === projectId);
    if (!row) return [];
    return row.repoIds.map((id) => db.findRepo(id)).filter((r): r is Repo => Boolean(r));
  }
  return request<Repo[]>(`/projects/${projectId}/repos`);
}

export async function getProjectRepo(projectId: string, repoId: number): Promise<Repo> {
  const repos = await listProjectRepos(projectId);
  const found = repos.find((r) => r.id === repoId);
  if (!found) throw new Error('이 프로젝트에 등록되지 않은 레포지토리입니다.');
  return found;
}

/** 레포를 여러 개 한 번에 등록한다. */
export async function addRepos(projectId: string, repoIds: number[]): Promise<Repo[]> {
  if (IS_MOCK) {
    await delay(360);
    db.update((s) => {
      const row = s.projects.find((p) => p.id === projectId);
      if (!row) return;
      for (const id of repoIds) if (!row.repoIds.includes(id)) row.repoIds.push(id);
    });
    return listProjectRepos(projectId);
  }
  return request<Repo[]>(`/projects/${projectId}/repos`, {
    method: 'POST',
    body: JSON.stringify({ repoIds }),
  });
}

export async function removeRepo(projectId: string, repoId: number): Promise<void> {
  if (IS_MOCK) {
    await delay(160);
    db.update((s) => {
      const row = s.projects.find((p) => p.id === projectId);
      if (row) row.repoIds = row.repoIds.filter((id) => id !== repoId);
    });
    return;
  }
  await request<void>(`/projects/${projectId}/repos/${repoId}`, { method: 'DELETE' });
}
