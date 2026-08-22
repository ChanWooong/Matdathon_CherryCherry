import type { User } from '../types';
import { BYPASS_AUTH, delay } from './config';
import * as db from './mock/db';
import { DEMO_USER } from './mock/fixtures';

/** 현재 로그인한 사용자. 미로그인이면 null. */
export async function getMe(): Promise<User | null> {
  await delay(80);
  if (BYPASS_AUTH) return DEMO_USER;
  return db.get().user;
}

/** GitHub 로그인 모양의 로컬 데모 세션을 시작한다. */
export async function signInWithGitHub(): Promise<User> {
  if (BYPASS_AUTH) return DEMO_USER;
  await delay(400);
  return db.update((s) => {
    s.user = DEMO_USER;
    return s.user;
  });
}

export async function signOut(): Promise<void> {
  if (BYPASS_AUTH) return;
  db.update((s) => { s.user = null; });
}
