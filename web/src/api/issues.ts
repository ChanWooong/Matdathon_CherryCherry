import type { CreateResult, Draft, Issue } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import * as db from './mock/db';

export async function listIssues(repoId: number, state: 'open' | 'closed' | 'all' = 'open'): Promise<Issue[]> {
  if (IS_MOCK) {
    await delay(420);
    const all = db.issuesOf(repoId);
    return state === 'all' ? all : all.filter((i) => i.state === state);
  }
  return request<Issue[]>(`/repos/${repoId}/issues?state=${state}`);
}

export async function getIssue(repoId: number, number: number): Promise<Issue> {
  if (IS_MOCK) {
    await delay(200);
    const found = db.issuesOf(repoId).find((i) => i.number === number);
    if (!found) throw new Error('이슈를 찾을 수 없습니다.');
    return found;
  }
  return request<Issue>(`/repos/${repoId}/issues/${number}`);
}

/** 승인된 초안을 실제 이슈로 만든다. */
export async function createIssuesFromDrafts(
  repoId: number,
  drafts: Draft[],
  meetingId?: string,
): Promise<CreateResult[]> {
  if (IS_MOCK) {
    const repo = db.findRepo(repoId);
    const results: CreateResult[] = [];
    let base = Math.max(0, ...db.issuesOf(repoId).map((i) => i.number)) + 1;

    for (const d of drafts) {
      await delay(380);
      const number = base++;
      const issue: Issue = {
        number,
        title: d.title,
        body: d.body,
        state: 'open',
        labels: d.labels,
        assignee: d.assignee,
        author: db.get().user?.login ?? 'cherry-dev',
        comments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fromMeeting: meetingId,
        url: `https://github.com/${repo?.fullName ?? 'org/repo'}/issues/${number}`,
      };
      db.update((s) => {
        const key = String(repoId);
        s.createdIssues[key] = [issue, ...(s.createdIssues[key] ?? [])];
        const m = s.meetings.find((x) => x.id === meetingId);
        if (m) m.issueCount += 1;
      });
      results.push({ draftId: d.id, ok: true, number, url: issue.url, title: d.title });
    }
    return results;
  }

  return request<CreateResult[]>(`/repos/${repoId}/issues/bulk`, {
    method: 'POST',
    body: JSON.stringify({ meetingId, drafts }),
  });
}
