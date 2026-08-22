import type { Meeting } from '../types';
import { delay } from './config';
import * as db from './mock/db';

export async function listMeetings(projectId: string): Promise<Meeting[]> {
  await delay(80);
  return db.get().meetings
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMeeting(projectId: string, meetingId: string): Promise<Meeting> {
  await delay(60);
  const m = db.get().meetings.find((x) => x.id === meetingId && x.projectId === projectId);
  if (!m) throw new Error('회의록을 찾을 수 없습니다.');
  return m;
}

export async function createMeeting(
  projectId: string,
  input: { title: string; content: string },
): Promise<Meeting> {
  await delay(100);
  return db.update((s) => {
    const now = new Date().toISOString();
    const m: Meeting = {
      id: db.nextId('m'),
      projectId,
      title: input.title.trim() || '제목 없는 회의록',
      content: input.content,
      createdAt: now,
      updatedAt: now,
      issueCount: 0,
    };
    s.meetings.push(m);
    return m;
  });
}

export async function updateMeeting(
  projectId: string,
  meetingId: string,
  input: { title: string; content: string },
): Promise<Meeting> {
  await delay(100);
  return db.update((s) => {
    const m = s.meetings.find((x) => x.id === meetingId && x.projectId === projectId);
    if (!m) throw new Error('회의록을 찾을 수 없습니다.');
    m.title = input.title.trim() || m.title;
    m.content = input.content;
    m.updatedAt = new Date().toISOString();
    return m;
  });
}

export async function deleteMeeting(projectId: string, meetingId: string): Promise<void> {
  await delay(80);
  db.update((s) => {
    s.meetings = s.meetings.filter((m) => m.id !== meetingId || m.projectId !== projectId);
  });
}
