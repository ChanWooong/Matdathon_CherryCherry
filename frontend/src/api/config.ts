export const API_MODE = (import.meta.env.VITE_API_MODE ?? 'live') as 'mock' | 'live';
export const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
export const API_KEY = import.meta.env.VITE_API_KEY ?? '';
export const BYPASS_AUTH =
  (import.meta.env.VITE_DEMO_BYPASS_AUTH ?? 'true') === 'true';
export const IS_MOCK = API_MODE === 'mock';
export const IS_DEMO_AUTH = true;

/** 목 모드에서 네트워크 지연을 흉내낸다. */
export function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
