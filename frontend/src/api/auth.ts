import type { User } from '../types';
import { request } from './client';
import { IS_MOCK, delay } from './config';
import * as db from './mock/db';
import { DEMO_USER } from './mock/fixtures';

/** 현재 로그인한 사용자. 미로그인이면 null. */
export async function getMe(): Promise<User | null> {
  if (IS_MOCK) {
    await delay(120);
    return db.get().user;
  }
  try {
    return await request<User>('/auth/me');
  } catch {
    return null;
  }
}

/** GitHub OAuth 시작. live 모드에서는 서버가 GitHub 로 리다이렉트한다. */
export async function signInWithGitHub(): Promise<User> {
  if (IS_MOCK) {
    await delay(700);
    return db.update((s) => {
      s.user = DEMO_USER;
      return s.user;
    });
  }
  window.location.href = '/api/auth/github';
  return new Promise<User>(() => {});
}

export async function signOut(): Promise<void> {
  if (IS_MOCK) {
    db.update((s) => { s.user = null; });
    return;
  }
  await request<void>('/auth/logout', { method: 'POST' });
}
