/* =========================================================================
   MeetToIssue — 공용 타입
   화면과 API 레이어가 공유하는 계약. 백엔드 응답 스키마와 1:1로 맞춘다.
   ========================================================================= */

import type { IconName } from './components/ui/Icon';

/* ------------------------------- 계정 ----------------------------------- */

export interface User {
  login: string;
  name: string;
  avatarUrl: string;
}

/* ------------------------------ 프로젝트 --------------------------------- */

export type ProjectAccent = 'clay' | 'moss' | 'ochre' | 'slate' | 'brick';

/** 홈에서 폴더 노드로 보여주는 작업 묶음. 레포와 회의록을 담는다. */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** 노드 색상 키 */
  accent: ProjectAccent;
  createdAt: string;
  repoCount: number;
  meetingCount: number;
}

/* ------------------------------ 레포지토리 -------------------------------- */

export interface Repo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string;
  language: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  openIssues: number;
  openPulls: number;
}

/* ------------------------------- 회의록 ---------------------------------- */

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  /** 붙여넣은 회의록 원문 */
  content: string;
  createdAt: string;
  updatedAt: string;
  /** 이 회의록으로 만든 이슈 개수 */
  issueCount: number;
}

/* -------------------------------- 이슈 ----------------------------------- */

export interface Issue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: string[];
  assignee: string | null;
  author: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
  /** 이 앱에서 회의록으로 만든 이슈 표시 */
  fromMeeting?: string;
  url: string;
}

/* --------------------------------- PR ------------------------------------ */

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  author: string;
  state: 'open' | 'merged' | 'closed';
  draft: boolean;
  head: string;
  base: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  linkedIssue: number | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface PullFile {
  path: string;
  status: 'added' | 'modified' | 'removed';
  additions: number;
  deletions: number;
}

/* ------------------------- 이슈 생성 파이프라인 ---------------------------- */

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
  /** 어느 회의록에서 나왔는지 */
  meetingId?: string;
}

export type AgentId = 'extractor' | 'composer' | 'reviewer';
export type AgentStatus = 'idle' | 'running' | 'done' | 'error';

export interface AgentState {
  id: AgentId;
  name: string;
  icon: IconName;
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

/* --------------------------- PR AI 리뷰 ----------------------------------- */

export type ReviewAgentId = 'requirements' | 'quality' | 'summary';

export interface ReviewFinding {
  id: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  text: string;
  ref?: string;
}

export interface ReviewSection {
  agent: ReviewAgentId;
  name: string;
  icon: IconName;
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
