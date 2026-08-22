import type { Decision, Draft, TaskItem } from '../../types';

/* =========================================================================
   회의록 원문 → 결정사항 / 할 일 / 이슈 초안
   백엔드 LLM 이 붙기 전까지 쓰는 규칙 기반 파서.
   실제 회의록에서 자주 보이는 표기를 기준으로 다듬었다.
   ========================================================================= */

const BULLET = /^\s*(?:[-*·•]|\d+[.)])\s+/;
const ACTION_HINT = /(하기로|해야|처리|수정|추가|확인|정리|검토|구현|배포|작성|점검|개선|조사|테스트|반영|공유|준비|필요)/;
const DECISION_HINT = /(확정|결정|정하기로|로 정함|합의)/;
const DUE_HINT = /(오늘|내일|모레|이번\s*주|다음\s*주|이번\s*달|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}월\s*\d{1,2}일|까지)/;
const PARTICIPANT_LINE = /^\s*(?:참석자|참가자|참석|멤버|참여자)\s*[:：]\s*(.+)$/;

/** 참석자 줄에서 이름을 뽑는다. */
function parseParticipants(lines: string[]): string[] {
  for (const line of lines) {
    const m = line.match(PARTICIPANT_LINE);
    if (!m) continue;
    return m[1]
      .split(/[,，、/·]|\s{2,}/)
      .map((s) => s.trim().replace(/\s*\(.*\)$/, ''))
      .filter((s) => s.length > 0 && s.length <= 12);
  }
  return [];
}

/**
 * 담당자 추정.
 * `@이름` → 괄호 `(이름)` → 참석자 이름 등장 순으로 본다.
 * 한 글자 이름(김, 이)은 다른 단어에 섞여 오탐이 나기 쉬워 경계를 요구한다.
 */
export function guessAssignee(text: string, participants: string[]): string | null {
  const at = text.match(/@([A-Za-z0-9_\-가-힣]{1,20})/);
  if (at) return at[1];

  const paren = text.match(/[(（]\s*([가-힣A-Za-z]{1,12})\s*[)）]/);
  if (paren && (participants.length === 0 || participants.includes(paren[1]))) return paren[1];

  for (const name of participants) {
    if (name.length === 1) {
      const re = new RegExp(`(^|[\\s(（→>\\-])${name}(이|가|은|는|께서|님)?[\\s,]`);
      if (re.test(`${text} `)) return name;
    } else if (text.includes(name)) {
      return name;
    }
  }
  return null;
}

/** 기한 표현을 뽑는다. */
export function guessDue(text: string): string | null {
  const slash = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (slash) return `${Number(slash[1])}/${Number(slash[2])}`;

  const kor = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (kor) return `${Number(kor[1])}/${Number(kor[2])}`;

  for (const word of ['오늘', '내일', '모레', '이번 주', '다음 주', '이번 달']) {
    if (text.replace(/\s+/g, ' ').includes(word)) return word;
  }
  return null;
}

/**
 * "로그인 버그 수정 → 김이 이번 주까지" 같은 문장에서
 * 화살표 뒤 담당/기한 꼬리를 잘라 제목만 남긴다.
 */
export function stripAssignmentTail(text: string, participants: string[]): string {
  const isAssignment = (tail: string) =>
    DUE_HINT.test(tail) || /@/.test(tail) || participants.some((p) => tail.includes(p));

  let out = text.trim();

  // 1) 화살표·콜론 뒤는 통째로 꼬리로 본다
  const arrow = out.split(/\s*(?:→|->|:|;)\s*/);
  if (arrow.length >= 2) {
    const head = arrow[0].trim();
    if (head.length >= 4 && isAssignment(arrow.slice(1).join(' '))) out = head;
  }

  // 2) 쉼표·마침표 뒤 마지막 조각이 담당/기한만 말하고 있으면 떼어낸다
  for (let i = 0; i < 2; i += 1) {
    const m = out.match(/^(.*?)\s*[,.·]\s*([^,.]{2,24})$/);
    if (!m) break;
    const [, head, tail] = m;
    if (head.trim().length < 6 || !isAssignment(tail)) break;
    out = head.trim();
  }

  return out;
}

function cleanTitle(text: string): string {
  return text
    .replace(BULLET, '')
    .replace(/\s*[(（][^)）]*[)）]\s*$/, '')
    .replace(/\s*@[A-Za-z0-9_\-가-힣]{1,20}\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,·]\s*$/, '')
    .trim();
}

export interface ExtractResult {
  decisions: Decision[];
  tasks: TaskItem[];
  participants: string[];
}

export function extractFromText(raw: string): ExtractResult {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, ''));
  const participants = parseParticipants(lines);

  const decisions: Decision[] = [];
  const tasks: TaskItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (PARTICIPANT_LINE.test(trimmed)) continue;
    if (/^\s*(일시|장소|안건|회의명|작성자)\s*[:：]/.test(trimmed)) continue;

    const isBullet = BULLET.test(line);
    const body = trimmed.replace(BULLET, '').trim();
    if (body.length < 4) continue;

    if (DECISION_HINT.test(body)) {
      decisions.push({ text: cleanTitle(body) });
      continue;
    }

    if (!isBullet && !ACTION_HINT.test(body)) continue;
    if (!ACTION_HINT.test(body) && !DUE_HINT.test(body)) continue;

    const assignee = guessAssignee(body, participants);
    const due = guessDue(body);
    const title = cleanTitle(stripAssignmentTail(body, participants));
    if (!title) continue;

    tasks.push({ title, assignee, due, evidence: trimmed });
  }

  return { decisions, tasks, participants };
}

/* ------------------------------ 라벨 규칙 -------------------------------- */

// 앞에 있는 규칙이 이긴다. "정리 필요" 같은 문장이 feature 로 새는 걸 막으려고
// 서술어(필요/하기로 함)가 아니라 작업의 성격을 가리키는 낱말만 본다.
const LABEL_RULES: [RegExp, string][] = [
  [/(버그|오류|에러|안 ?됨|깨짐|실패|무한|재현|문제|사라지|누락|잘못)/, 'bug'],
  [/(문서|가이드|리드미|readme|온보딩)/i, 'documentation'],
  [/(테스트|검증|점검|qa)/i, 'test'],
  [/(리팩터|리팩토링|정리|정돈|제거|삭제|의존성|버전 ?업)/, 'chore'],
  [/(개선|향상|최적화|속도|성능|접근성)/, 'enhancement'],
  [/(추가|구현|도입|만들기|신규|기능)/, 'feature'],
];

/** 라벨은 최대 2개까지만 단다. 세 개 넘게 붙으면 GitHub 목록에서 읽기 어렵다. */
export function guessLabels(text: string): string[] {
  const hits: string[] = [];
  for (const [re, label] of LABEL_RULES) {
    if (re.test(text)) hits.push(label);
  }
  if (hits.length === 0) return ['feature'];
  return hits.slice(0, 2);
}

/* --------------------------- 할 일 → 이슈 초안 ---------------------------- */

function acFor(task: TaskItem): string[] {
  const base = [`${task.title} 가 완료되어 동작을 확인할 수 있다`];
  if (/(버그|오류|에러|안 ?됨|깨짐|실패|무한)/.test(task.title)) {
    base.push('재현 절차대로 실행했을 때 문제가 재발하지 않는다');
    base.push('회귀를 막는 테스트가 추가되어 있다');
  } else {
    base.push('관련 테스트 또는 확인 절차가 문서에 남아 있다');
  }
  return base;
}

export function tasksToDrafts(tasks: TaskItem[], meetingId?: string): Draft[] {
  return tasks.map((task, i) => {
    const ac = acFor(task);
    const body = [
      '## 배경',
      `회의록에서 확인된 항목입니다.`,
      '',
      '## 할 일',
      `- ${task.title}`,
      '',
      '## 완료 조건',
      ...ac.map((a) => `- [ ] ${a}`),
      '',
      '## 근거 (회의록 발췌)',
      `> ${task.evidence}`,
    ].join('\n');

    return {
      id: `d${i + 1}`,
      title: task.title,
      body,
      labels: guessLabels(`${task.title} ${task.evidence}`),
      assignee: task.assignee,
      due: task.due,
      ac: ac.map((text) => ({ text, done: false })),
      evidence: task.evidence,
      selected: true,
      warnings: [],
      meetingId,
    };
  });
}

/* ------------------------------- 검수 규칙 -------------------------------- */

export function reviewDrafts(drafts: Draft[]): { draftId: string; warnings: string[] }[] {
  const seen = new Map<string, string>();

  return drafts.map((d) => {
    const warnings: string[] = [];
    if (!d.due) warnings.push('기한이 없습니다. 회의에서 정해진 날짜가 있는지 확인해 주세요.');
    if (!d.assignee) warnings.push('담당자가 지정되지 않았습니다.');
    if (d.title.length < 8) warnings.push('제목이 짧아 무엇을 하는 작업인지 모호합니다.');
    if (d.ac.length < 2) warnings.push('완료 조건이 부족합니다.');

    const key = d.title.replace(/\s+/g, '').toLowerCase();
    const prev = seen.get(key);
    if (prev) warnings.push(`"${prev}" 와 내용이 겹칩니다. 하나로 합치는 게 좋겠습니다.`);
    else seen.set(key, d.title);

    return { draftId: d.id, warnings };
  });
}
