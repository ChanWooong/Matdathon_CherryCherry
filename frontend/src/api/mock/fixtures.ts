import type { Issue, PullRequest, Repo, User } from '../../types';

export const DEMO_USER: User = {
  login: 'cherry-dev',
  name: '체리',
  avatarUrl: '',
};

/** GitHub 계정에 연결된 것처럼 보이는 레포 목록 */
export const AVAILABLE_REPOS: Repo[] = [
  {
    id: 101, owner: 'cherrylab', name: 'meet-to-issue-web', fullName: 'cherrylab/meet-to-issue-web',
    description: '회의록을 이슈로 바꾸는 웹 클라이언트', language: 'TypeScript', private: false,
    defaultBranch: 'main', updatedAt: '2025-08-21T09:12:00Z', openIssues: 7, openPulls: 3,
  },
  {
    id: 102, owner: 'cherrylab', name: 'meet-to-issue-api', fullName: 'cherrylab/meet-to-issue-api',
    description: '에이전트 오케스트레이션 서버', language: 'Python', private: false,
    defaultBranch: 'main', updatedAt: '2025-08-21T04:40:00Z', openIssues: 5, openPulls: 2,
  },
  {
    id: 103, owner: 'cherrylab', name: 'design-system', fullName: 'cherrylab/design-system',
    description: '공용 컴포넌트와 토큰', language: 'CSS', private: false,
    defaultBranch: 'main', updatedAt: '2025-08-19T11:02:00Z', openIssues: 3, openPulls: 1,
  },
  {
    id: 104, owner: 'cherrylab', name: 'infra-terraform', fullName: 'cherrylab/infra-terraform',
    description: '배포 인프라 정의', language: 'HCL', private: true,
    defaultBranch: 'main', updatedAt: '2025-08-14T15:30:00Z', openIssues: 2, openPulls: 0,
  },
  {
    id: 105, owner: 'cherrylab', name: 'docs', fullName: 'cherrylab/docs',
    description: '팀 문서 모음', language: 'MDX', private: false,
    defaultBranch: 'main', updatedAt: '2025-08-08T08:00:00Z', openIssues: 1, openPulls: 1,
  },
  {
    id: 106, owner: 'cherry-dev', name: 'sandbox', fullName: 'cherry-dev/sandbox',
    description: '개인 실험용', language: 'JavaScript', private: true,
    defaultBranch: 'main', updatedAt: '2025-07-30T21:15:00Z', openIssues: 0, openPulls: 0,
  },
];

/** 레포별 기본 이슈. 앱에서 만든 이슈는 여기에 덧붙는다. */
export const SEED_ISSUES: Record<number, Issue[]> = {
  101: [
    {
      number: 142, title: '로그인 토큰 만료 시 무한 리다이렉트',
      body: '만료된 토큰으로 접근하면 /login 과 / 사이를 오간다.\n\n## 재현\n1. 토큰 만료 후 새로고침\n2. 주소창이 계속 바뀜',
      state: 'open', labels: ['bug', 'priority:high'], assignee: 'cherry-dev', author: 'minji',
      comments: 4, createdAt: '2025-08-18T02:00:00Z', updatedAt: '2025-08-21T06:20:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-web/issues/142',
    },
    {
      number: 139, title: '회의록 붙여넣기 시 줄바꿈이 사라짐',
      body: '클립보드에서 붙여넣으면 개행이 공백으로 바뀐다.', state: 'open',
      labels: ['bug'], assignee: null, author: 'cherry-dev',
      comments: 1, createdAt: '2025-08-16T07:30:00Z', updatedAt: '2025-08-20T01:10:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-web/issues/139',
    },
    {
      number: 135, title: '이슈 초안 편집 화면 접근성 점검',
      body: '키보드만으로 초안 승인까지 도달 가능한지 확인.', state: 'open',
      labels: ['enhancement', 'a11y'], assignee: 'sujin', author: 'sujin',
      comments: 0, createdAt: '2025-08-12T05:00:00Z', updatedAt: '2025-08-15T09:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-web/issues/135',
    },
  ],
  102: [
    {
      number: 88, title: 'SSE 연결이 30초에 끊김',
      body: '프록시 타임아웃으로 추정. keep-alive 핑 필요.', state: 'open',
      labels: ['bug', 'infra'], assignee: 'jaeho', author: 'jaeho',
      comments: 6, createdAt: '2025-08-19T03:00:00Z', updatedAt: '2025-08-21T02:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-api/issues/88',
    },
    {
      number: 85, title: '추출 에이전트 프롬프트 버전 관리',
      body: '프롬프트를 코드에서 분리하고 버전을 남긴다.', state: 'open',
      labels: ['chore'], assignee: null, author: 'minji',
      comments: 2, createdAt: '2025-08-14T08:20:00Z', updatedAt: '2025-08-18T11:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-api/issues/85',
    },
  ],
  103: [
    {
      number: 24, title: '버튼 포커스 링이 배경과 대비가 낮음',
      body: '명도 대비 3:1 을 넘기지 못한다.', state: 'open',
      labels: ['a11y', 'enhancement'], assignee: 'sujin', author: 'sujin',
      comments: 1, createdAt: '2025-08-11T10:00:00Z', updatedAt: '2025-08-17T04:00:00Z',
      url: 'https://github.com/cherrylab/design-system/issues/24',
    },
  ],
  104: [], 105: [], 106: [],
};

export const SEED_PULLS: Record<number, PullRequest[]> = {
  101: [
    {
      number: 147, title: '회의록 붙여넣기 개행 보존', author: 'cherry-dev', state: 'open', draft: false,
      head: 'fix/paste-newline', base: 'main', additions: 42, deletions: 8, changedFiles: 3,
      linkedIssue: 139, createdAt: '2025-08-20T02:00:00Z', updatedAt: '2025-08-21T07:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-web/pull/147',
      body: `## 무엇을 바꿨나\n\`onPaste\` 에서 \`text/plain\` 을 직접 읽어 개행을 유지하도록 했습니다.\n\n## 왜\n브라우저 기본 동작이 HTML 클립보드를 우선 처리하면서 \`<div>\` 가 공백으로 평탄화되고 있었습니다.\n\n## 확인\n- [x] Chrome / Safari 에서 붙여넣기 확인\n- [x] 기존 입력 테스트 통과\n- [ ] 모바일 확인 못 함\n\ncloses #139`,
    },
    {
      number: 145, title: '초안 편집 화면 키보드 내비게이션', author: 'sujin', state: 'open', draft: true,
      head: 'feat/a11y-draft', base: 'main', additions: 118, deletions: 23, changedFiles: 7,
      linkedIssue: 135, createdAt: '2025-08-18T06:00:00Z', updatedAt: '2025-08-20T10:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-web/pull/145',
      body: `초안 카드에 roving tabindex 를 적용했습니다. 아직 스크린리더 라벨은 정리 중입니다.\n\nrefs #135`,
    },
    {
      number: 140, title: '토큰 갱신 인터셉터 추가', author: 'jaeho', state: 'merged', draft: false,
      head: 'fix/token-refresh', base: 'main', additions: 76, deletions: 12, changedFiles: 4,
      linkedIssue: 142, createdAt: '2025-08-15T01:00:00Z', updatedAt: '2025-08-17T05:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-web/pull/140',
      body: '401 응답을 만나면 한 번만 갱신을 시도하고 실패하면 로그인으로 보냅니다.',
    },
  ],
  102: [
    {
      number: 91, title: 'SSE keep-alive 핑 전송', author: 'jaeho', state: 'open', draft: false,
      head: 'fix/sse-keepalive', base: 'main', additions: 31, deletions: 2, changedFiles: 2,
      linkedIssue: 88, createdAt: '2025-08-20T09:00:00Z', updatedAt: '2025-08-21T01:00:00Z',
      url: 'https://github.com/cherrylab/meet-to-issue-api/pull/91',
      body: '15초마다 주석 프레임(`: ping`)을 보내 프록시가 연결을 끊지 않게 합니다.\n\ncloses #88',
    },
  ],
  103: [
    {
      number: 27, title: '포커스 링 대비 상향', author: 'sujin', state: 'open', draft: false,
      head: 'fix/focus-ring', base: 'main', additions: 14, deletions: 9, changedFiles: 2,
      linkedIssue: 24, createdAt: '2025-08-17T03:00:00Z', updatedAt: '2025-08-19T08:00:00Z',
      url: 'https://github.com/cherrylab/design-system/pull/27',
      body: '포커스 링 색을 한 단계 진하게 바꾸고 두께를 3px 로 올렸습니다.',
    },
  ],
  104: [], 105: [], 106: [],
};

export const SAMPLE_MEETING = `참석자: 민지, 재호, 수진, 지훈
일시: 8/21 14:00 스프린트 점검

- 로그인 토큰 만료되면 화면이 무한 리다이렉트되는 버그 있음 → 지훈이 이번 주까지 처리
- 회의록 붙여넣을 때 줄바꿈 사라지는 문제 확인 필요, 재호가 8/23까지
- 초안 편집 화면 키보드 접근성 점검하기로 함. 수진 담당
- 온보딩 문서 정리 필요 (민지)
- 배포는 스테이징 먼저 올리고 금요일에 프로덕션으로 정함
- SSE 30초 끊김은 프록시 타임아웃으로 확정. keep-alive 핑 추가하기로 합의`;
