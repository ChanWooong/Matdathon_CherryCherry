import type { Issue, Meeting, ProjectAccent, User } from '../../types';
import { AVAILABLE_REPOS, SEED_ISSUES, SAMPLE_MEETING } from './fixtures';

/**
 * 백엔드가 없는 동안 쓰는 로컬 저장소.
 * 새로고침해도 상태가 남아야 데모가 자연스러워서 localStorage 에 넣는다.
 * 백엔드가 붙으면 이 파일만 버리면 된다.
 */

const KEY = 'm2i.db.v2';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  accent: ProjectAccent;
  createdAt: string;
  repoIds: number[];
}

interface Shape {
  user: User | null;
  projects: ProjectRow[];
  meetings: Meeting[];
  /** 앱에서 만든 이슈 (레포 id 별) */
  createdIssues: Record<string, Issue[]>;
  seq: number;
}

const ACCENTS: ProjectAccent[] = ['clay', 'moss', 'ochre', 'slate', 'brick'];

function seed(): Shape {
  const now = new Date().toISOString();
  return {
    user: null,
    projects: [
      {
        id: 'p1',
        name: '체리체리 해커톤',
        description: '회의록 → 이슈 자동화 데모',
        accent: 'clay',
        createdAt: now,
        repoIds: [101, 102],
      },
      {
        id: 'p2',
        name: '디자인 시스템 정비',
        description: '토큰과 컴포넌트 정리',
        accent: 'moss',
        createdAt: now,
        repoIds: [103],
      },
    ],
    meetings: [
      {
        id: 'm1',
        projectId: 'p1',
        title: '8/21 스프린트 점검',
        content: SAMPLE_MEETING,
        createdAt: now,
        updatedAt: now,
        issueCount: 0,
      },
      {
        id: 'm2',
        projectId: 'p1',
        title: '8/14 킥오프',
        content: `참석자: 민지, 재호, 수진\n\n- 데모 시나리오는 회의록 붙여넣기부터 이슈 생성까지로 정함\n- 인증은 GitHub OAuth 로 확정\n- 화면 흐름 초안은 수진이 8/16까지 정리`,
        createdAt: now,
        updatedAt: now,
        issueCount: 2,
      },
    ],
    createdIssues: {},
    seq: 100,
  };
}

let cache: Shape | null = null;

function read(): Shape {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Shape) : seed();
  } catch {
    cache = seed();
  }
  return cache;
}

function write(next: Shape) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장 실패해도 메모리 캐시로 세션은 이어간다
  }
}

/** 상태를 읽고 바꾼 뒤 저장한다. */
export function update<T>(fn: (db: Shape) => T): T {
  const db = read();
  const out = fn(db);
  write(db);
  return out;
}

export function get(): Shape {
  return read();
}

export function nextId(prefix: string): string {
  return update((db) => {
    db.seq += 1;
    return `${prefix}${db.seq}`;
  });
}

export function pickAccent(index: number): ProjectAccent {
  return ACCENTS[index % ACCENTS.length];
}

/** 레포 id → 레포 메타 */
export function findRepo(id: number) {
  return AVAILABLE_REPOS.find((r) => r.id === id);
}

/** 시드 이슈 + 앱에서 만든 이슈 */
export function issuesOf(repoId: number): Issue[] {
  const db = read();
  const made = db.createdIssues[String(repoId)] ?? [];
  return [...made, ...(SEED_ISSUES[repoId] ?? [])];
}

export function resetAll() {
  cache = null;
  localStorage.removeItem(KEY);
}
