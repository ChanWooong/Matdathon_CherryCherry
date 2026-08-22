import type { Meeting } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import * as db from './mock/db';

export async function listMeetings(projectId: string): Promise<Meeting[]> {
  if (IS_MOCK) {
    await delay(180);
    return db.get().meetings
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return request<Meeting[]>(`/projects/${projectId}/meetings`);
}

export async function getMeeting(projectId: string, meetingId: string): Promise<Meeting> {
  if (IS_MOCK) {
    await delay(120);
    const m = db.get().meetings.find((x) => x.id === meetingId && x.projectId === projectId);
    if (!m) throw new Error('회의록을 찾을 수 없습니다.');
    return m;
  }
  return request<Meeting>(`/projects/${projectId}/meetings/${meetingId}`);
}

export async function createMeeting(
  projectId: string,
  input: { title: string; content: string },
): Promise<Meeting> {
  if (IS_MOCK) {
    await delay(320);
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
  return request<Meeting>(`/projects/${projectId}/meetings`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateMeeting(
  projectId: string,
  meetingId: string,
  input: { title: string; content: string },
): Promise<Meeting> {
  if (IS_MOCK) {
    await delay(280);
    return db.update((s) => {
      const m = s.meetings.find((x) => x.id === meetingId);
      if (!m) throw new Error('회의록을 찾을 수 없습니다.');
      m.title = input.title.trim() || m.title;
      m.content = input.content;
      m.updatedAt = new Date().toISOString();
      return m;
    });
  }
  return request<Meeting>(`/projects/${projectId}/meetings/${meetingId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteMeeting(projectId: string, meetingId: string): Promise<void> {
  if (IS_MOCK) {
    await delay(180);
    db.update((s) => { s.meetings = s.meetings.filter((m) => m.id !== meetingId); });
    return;
  }
  await request<void>(`/projects/${projectId}/meetings/${meetingId}`, { method: 'DELETE' });
}
