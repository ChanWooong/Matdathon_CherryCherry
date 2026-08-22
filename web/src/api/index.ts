import type {
  CreateResult, Draft, Issue, PullRequest, Repo, ReviewEvent, StreamEvent,
} from '../types';
import * as mock from './mock';
import * as real from './real';

export interface Api {
  listRepos(): Promise<Repo[]>;
  listIssues(repo: string): Promise<Issue[]>;
  listPullRequests(repo: string): Promise<PullRequest[]>;
  analyze(input: { repo: string; text: string }, signal: AbortSignal): AsyncGenerator<StreamEvent>;
  createIssues(repo: string, drafts: Draft[]): Promise<CreateResult[]>;
  reviewPullRequest(repo: string, pr: PullRequest, signal: AbortSignal): AsyncGenerator<ReviewEvent>;
  postPrComment(repo: string, pr: number, body: string): Promise<{ url: string }>;
}

/**
 * VITE_API_MODE=live 로 두면 실제 백엔드(SSE)에 붙고,
 * 기본값(mock)에서는 브라우저 안에서 에이전트 파이프라인을 시뮬레이션한다.
 * 백엔드가 준비되기 전에도 전체 플로우를 데모할 수 있게 하기 위한 스위치.
 */
export const API_MODE: 'mock' | 'live' =
  import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock';

const mockApi: Api = {
  listRepos: mock.listRepos,
  listIssues: mock.listIssues,
  listPullRequests: mock.listPullRequests,
  analyze: mock.analyze,
  createIssues: mock.createIssues,
  reviewPullRequest: mock.reviewPullRequest,
  postPrComment: (repo, pr) => mock.postPrComment(repo, pr),
};

const liveApi: Api = {
  listRepos: real.listRepos,
  listIssues: real.listIssues,
  listPullRequests: real.listPullRequests,
  analyze: real.analyze,
  createIssues: real.createIssues,
  reviewPullRequest: real.reviewPullRequest,
  postPrComment: real.postPrComment,
};

export const api: Api = API_MODE === 'live' ? liveApi : mockApi;
