import type { Project } from '../types';
import { delay } from './config';
import * as db from './mock/db';

function toProject(row: db.ProjectRow, meetingCount: number): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    accent: row.accent,
    createdAt: row.createdAt,
    repoCount: row.repoIds.length,
    meetingCount,
  };
}

export async function listProjects(): Promise<Project[]> {
  await delay(80);
  const s = db.get();
  return s.projects.map((p) =>
    toProject(p, s.meetings.filter((m) => m.projectId === p.id).length),
  );
}

export async function getProject(id: string): Promise<Project> {
  await delay(60);
  const s = db.get();
  const row = s.projects.find((p) => p.id === id);
  if (!row) throw new Error('프로젝트를 찾을 수 없습니다.');
  return toProject(row, s.meetings.filter((m) => m.projectId === id).length);
}

export async function createProject(input: { name: string; description: string }): Promise<Project> {
  await delay(100);
  return db.update((s) => {
    const row: db.ProjectRow = {
      id: db.nextId('p'),
      name: input.name.trim(),
      description: input.description.trim(),
      accent: db.pickAccent(s.projects.length),
      createdAt: new Date().toISOString(),
      repoIds: [],
    };
    s.projects.push(row);
    return toProject(row, 0);
  });
}

export async function deleteProject(id: string): Promise<void> {
  await delay(80);
  db.update((s) => {
    s.projects = s.projects.filter((p) => p.id !== id);
    s.meetings = s.meetings.filter((m) => m.projectId !== id);
  });
}
