import type { Issue, PullRequest, Repo } from '../types';

export const DEMO_MEETING = `8/22 스프린트 회의
참석: 김, 이, 박

- 로그인 토큰 만료 버그 → 김이 이번 주까지 처리하기로 함
- 검색 API 페이지네이션 필요 (이)
- 배포 스크립트 정리하기로 함
- 토큰 만료 정책은 24시간으로 확정
- 배포 주기는 주 1회로 결정`;

export const REPOS: Repo[] = [
  { id: 1, fullName: 'my-team/backend-api', issues: 12, prs: 3, starred: true, lastUsed: '2시간 전' },
  { id: 2, fullName: 'my-team/web-client', issues: 5, prs: 1, lastUsed: '어제' },
  { id: 3, fullName: 'octocat/hello-world', issues: 0, prs: 0 },
  { id: 4, fullName: 'octocat/spec-kit', issues: 7, prs: 2 },
];

export const ISSUES: Record<string, Issue[]> = {
  'my-team/backend-api': [
    {
      number: 42, title: '로그인 토큰 만료 처리', state: 'open', labels: ['bug'],
      assignee: 'kim', updatedAt: '3일 전', url: '#',
    },
    {
      number: 41, title: '검색 API 페이지네이션 추가', state: 'open', labels: ['feature'],
      assignee: 'lee', updatedAt: '5일 전', url: '#', aiGenerated: true,
    },
    {
      number: 38, title: '배포 스크립트 정리', state: 'closed', labels: ['chore'],
      assignee: null, updatedAt: '1주 전', url: '#',
    },
  ],
};

export const PRS: Record<string, PullRequest[]> = {
  'my-team/backend-api': [
    { number: 57, title: '토큰 만료 처리 구현', author: 'kim', additions: 142, deletions: 38, linkedIssue: 43, url: '#' },
    { number: 56, title: '검색 페이지네이션', author: 'lee', additions: 88, deletions: 12, linkedIssue: null, url: '#' },
    { number: 55, title: '배포 스크립트 리팩터', author: 'park', additions: 31, deletions: 60, linkedIssue: null, url: '#' },
  ],
};
