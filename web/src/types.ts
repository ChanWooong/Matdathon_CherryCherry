export interface Repo {
  id: number;
  fullName: string;
  issues: number;
  prs: number;
  starred?: boolean;
  lastUsed?: string;
}

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  assignee: string | null;
  updatedAt: string;
  aiGenerated?: boolean;
  url: string;
}

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  additions: number;
  deletions: number;
  linkedIssue: number | null;
  url: string;
}

export interface AcItem {
  text: string;
  done: boolean;
}

export interface Decision {
  text: string;
}

export interface TaskItem {
  title: string;
  assignee: string | null;
  due: string | null;
  evidence: string;
}

/** 정리 에이전트가 만든 이슈 초안. 사용자가 승인 전 자유롭게 편집한다. */
export interface Draft {
  id: string;
  title: string;
  body: string;
  labels: string[];
  assignee: string | null;
  due: string | null;
  ac: AcItem[];
  evidence: string;
  selected: boolean;
  /** 검수 에이전트가 지적한 문제들 */
  warnings: string[];
}

export type AgentId = 'extractor' | 'composer' | 'reviewer';
export type AgentStatus = 'idle' | 'running' | 'done' | 'error';

export interface AgentState {
  id: AgentId;
  name: string;
  icon: string;
  status: AgentStatus;
  note: string;
  ms?: number;
  progress?: number;
}

export type StreamEvent =
  | { type: 'agent_start'; agent: AgentId }
  | { type: 'token'; agent: AgentId; text: string }
  | { type: 'progress'; agent: AgentId; note: string; progress: number }
  | { type: 'decisions'; items: Decision[] }
  | { type: 'tasks'; items: TaskItem[] }
  | { type: 'drafts'; items: Draft[] }
  | { type: 'review'; items: { draftId: string; warnings: string[] }[] }
  | { type: 'agent_done'; agent: AgentId; ms: number; note: string }
  | { type: 'error'; agent: AgentId; message: string }
  | { type: 'done' };

export interface CreateResult {
  draftId: string;
  ok: boolean;
  number?: number;
  url?: string;
  title: string;
  error?: string;
}

export type ReviewAgentId = 'requirements' | 'quality' | 'summary';

export interface ReviewFinding {
  id: string;
  /** 요구사항 대조에서 충족 여부 */
  status: 'pass' | 'fail' | 'warn' | 'info';
  text: string;
  ref?: string;
}

export interface ReviewSection {
  agent: ReviewAgentId;
  name: string;
  icon: string;
  status: AgentStatus;
  ms?: number;
  findings: ReviewFinding[];
  note?: string;
  adopted: boolean;
}

export type ReviewEvent =
  | { type: 'agent_start'; agent: ReviewAgentId }
  | { type: 'findings'; agent: ReviewAgentId; items: ReviewFinding[] }
  | { type: 'agent_done'; agent: ReviewAgentId; ms: number; note?: string }
  | { type: 'error'; agent: ReviewAgentId; message: string }
  | { type: 'done' };
