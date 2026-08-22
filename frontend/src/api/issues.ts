import type { CreateResult, Draft, Issue } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import * as db from './mock/db';
import { requireRepo } from './repos';

interface ApiIssue {
  number: number;
  title: string;
  body?: string | null;
  state: 'open' | 'closed';
  labels?: Array<string | { name: string }>;
  assignees?: Array<{ login: string }>;
  user?: { login: string };
  comments?: number;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  url?: string;
}

interface ApiCreateResponse {
  results: Array<{
    draft_id: string;
    title: string;
    ok: boolean;
    number?: number | null;
    url?: string | null;
    error?: string | null;
  }>;
}

function toIssue(issue: ApiIssue): Issue {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: issue.state,
    labels: (issue.labels ?? []).map((label) => typeof label === 'string' ? label : label.name),
    assignee: issue.assignees?.[0]?.login ?? null,
    author: issue.user?.login ?? 'unknown',
    comments: issue.comments ?? 0,
    createdAt: issue.created_at ?? new Date(0).toISOString(),
    updatedAt: issue.updated_at ?? issue.created_at ?? new Date(0).toISOString(),
    url: issue.html_url ?? issue.url ?? '#',
  };
}

function apiDraft(draft: Draft) {
  return {
    draft_id: draft.id,
    title: draft.title,
    body: draft.body,
    acceptance_criteria: draft.ac.map((criterion, index) => ({
      id: `AC${index + 1}`,
      text: criterion.text,
    })),
    labels: draft.labels,
    assignees: draft.assignee ? [draft.assignee] : [],
    evidence: draft.evidence,
    source_task_title: draft.title,
  };
}

export async function listIssues(
  repoId: number,
  state: 'open' | 'closed' | 'all' = 'open',
): Promise<Issue[]> {
  if (IS_MOCK) {
    await delay(180);
    const all = db.issuesOf(repoId);
    return state === 'all' ? all : all.filter((issue) => issue.state === state);
  }
  const repo = requireRepo(repoId);
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/issues?limit=100`;
  return (await request<ApiIssue[]>(path)).map(toIssue);
}

/** 사용자가 선택하고 승인한 초안만 실제 GitHub 이슈로 만든다. */
export async function createIssuesFromDrafts(
  repoId: number,
  drafts: Draft[],
  meetingId?: string,
): Promise<CreateResult[]> {
  if (IS_MOCK) {
    const repo = db.findRepo(repoId);
    const results: CreateResult[] = [];
    let base = Math.max(0, ...db.issuesOf(repoId).map((issue) => issue.number)) + 1;
    for (const draft of drafts) {
      await delay(120);
      const number = base++;
      const issue: Issue = {
        number,
        title: draft.title,
        body: draft.body,
        state: 'open',
        labels: draft.labels,
        assignee: draft.assignee,
        author: db.get().user?.login ?? 'cherry-dev',
        comments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fromMeeting: meetingId,
        url: `https://github.com/${repo?.fullName ?? 'org/repo'}/issues/${number}`,
      };
      db.update((state) => {
        const key = String(repoId);
        state.createdIssues[key] = [issue, ...(state.createdIssues[key] ?? [])];
        const meeting = state.meetings.find((item) => item.id === meetingId);
        if (meeting) meeting.issueCount += 1;
      });
      results.push({ draftId: draft.id, ok: true, number, url: issue.url, title: draft.title });
    }
    return results;
  }

  const repo = requireRepo(repoId);
  const response = await request<ApiCreateResponse>('/issues', {
    method: 'POST',
    body: JSON.stringify({
      repo: repo.fullName,
      drafts: drafts.map(apiDraft),
      approved: true,
    }),
  });
  return response.results.map((result) => ({
    draftId: result.draft_id,
    title: result.title,
    ok: result.ok,
    number: result.number ?? undefined,
    url: result.url ?? undefined,
    error: result.error ?? undefined,
  }));
}
