import type {
  CreateResult, Draft, Issue, PullRequest, Repo, ReviewEvent, StreamEvent,
} from '../types';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

/**
 * SSE(text/event-stream) 응답을 파싱해 이벤트를 순서대로 넘겨준다.
 * 백엔드는 `data: {json}\n\n` 형태로 흘려보내면 된다.
 */
async function* sse<T>(path: string, body: unknown, signal: AbortSignal): AsyncGenerator<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`스트리밍 연결 실패: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        yield JSON.parse(payload) as T;
      }
    }
  }
}

export const listRepos = () => json<Repo[]>('/repos');
export const listIssues = (repo: string) => json<Issue[]>(`/repos/${repo}/issues`);
export const listPullRequests = (repo: string) => json<PullRequest[]>(`/repos/${repo}/pulls`);

export const analyze = (input: { repo: string; text: string }, signal: AbortSignal) =>
  sse<StreamEvent>('/analyze', input, signal);

export const createIssues = (repo: string, drafts: Draft[]) =>
  json<CreateResult[]>(`/repos/${repo}/issues/bulk`, {
    method: 'POST',
    body: JSON.stringify({ drafts }),
  });

export const reviewPullRequest = (repo: string, pr: PullRequest, signal: AbortSignal) =>
  sse<ReviewEvent>(`/repos/${repo}/pulls/${pr.number}/review`, {}, signal);

export const postPrComment = (repo: string, pr: number, body: string) =>
  json<{ url: string }>(`/repos/${repo}/pulls/${pr}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
