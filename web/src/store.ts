import { createContext, useContext } from 'react';
import type {
  AgentState, CreateResult, Decision, Draft, Repo, TaskItem,
} from './types';

export const AGENTS: AgentState[] = [
  { id: 'extractor', name: '추출 에이전트', icon: '🔍', status: 'idle', note: '대기 중' },
  { id: 'composer', name: '정리 에이전트', icon: '📝', status: 'idle', note: '대기 중' },
  { id: 'reviewer', name: '검수 에이전트', icon: '✅', status: 'idle', note: '대기 중' },
];

/** 회의록 → 이슈 플로우 한 번의 세션 상태 */
export interface AnalysisSession {
  repo: string;
  meetingText: string;
  agents: AgentState[];
  transcript: Record<string, string>;
  decisions: Decision[];
  tasks: TaskItem[];
  drafts: Draft[];
  results: CreateResult[];
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

export const emptySession = (repo = '', meetingText = ''): AnalysisSession => ({
  repo,
  meetingText,
  agents: AGENTS.map((a) => ({ ...a })),
  transcript: { extractor: '', composer: '', reviewer: '' },
  decisions: [],
  tasks: [],
  drafts: [],
  results: [],
  startedAt: null,
  finishedAt: null,
  error: null,
});

export interface Store {
  repo: Repo | null;
  setRepo(repo: Repo | null): void;
  session: AnalysisSession;
  setSession: React.Dispatch<React.SetStateAction<AnalysisSession>>;
  toast(message: string, kind?: 'ok' | 'err'): void;
  newIssueNumbers: number[];
  setNewIssueNumbers(n: number[]): void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreContext가 없습니다');
  return ctx;
}

export const REPO_KEY = 'm2i.repo';
