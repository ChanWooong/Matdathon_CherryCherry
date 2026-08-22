/**
 * API 배럴.
 * 화면에서는 `import { projects, meetings } from '../api'` 처럼 도메인 단위로 쓴다.
 * 백엔드도 같은 경계로 파일을 나누면 대응이 쉬워진다.
 */
export * as auth from './auth';
export * as projects from './projects';
export * as repos from './repos';
export * as meetings from './meetings';
export * as issues from './issues';
export * as pulls from './pulls';
export * as agents from './agents';
export { API_MODE, IS_MOCK } from './config';
export { ApiError } from './client';
