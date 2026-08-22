/**
 * API 실행 모드.
 * - mock : 브라우저 안에서 모두 처리 (백엔드 없이 데모 가능)
 * - live : 실제 백엔드 호출
 * .env 의 VITE_API_MODE 로 전환한다.
 */
export const API_MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'live';
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
export const IS_MOCK = API_MODE === 'mock';
export const BYPASS_AUTH = (import.meta.env.VITE_DEMO_BYPASS_AUTH ?? 'false') === 'true';

/** 목 모드에서 네트워크 지연을 흉내낸다. */
export function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
