import type { Decision, Draft, TaskItem } from '../types';

const BULLET = /^\s*[-*•·–—]\s*/;
const DECISION_HINT = /(확정|결정|정하기로|로 정함|합의)/;
const ACTION_HINT = /(하기로|해야|필요|까지|추가|수정|구현|정리|개선|작성|검토|배포|조사|확인|리팩터|테스트|문서)/;
const NOISE = /^(참석|참여|일시|장소|안건|아젠다|회의록|다음 회의|agenda|attendees)\s*[:：]/i;

const LABEL_RULES: [RegExp, string][] = [
  [/(버그|오류|에러|장애|실패|깨짐|bug|fix)/i, 'bug'],
  [/(정리|리팩터|리팩토링|제거|정돈|청소|chore|cleanup)/i, 'chore'],
  [/(문서|가이드|readme|docs)/i, 'documentation'],
  [/(테스트|test|커버리지)/i, 'test'],
  [/(추가|구현|신규|도입|개발|지원|필요|feature)/i, 'feature'],
];

function guessLabel(text: string): string {
  for (const [re, label] of LABEL_RULES) if (re.test(text)) return label;
  return 'enhancement';
}

/** "@name" 또는 참석자 명단에 등장한 이름을 담당자로 추정한다. */
function guessAssignee(line: string, participants: string[]): string | null {
  const at = line.match(/@([A-Za-z0-9_-]+)/);
  if (at) return at[1];

  const paren = line.match(/[（(]\s*([^)）]{1,12}?)\s*[)）]\s*$/);
  if (paren && participants.some((p) => paren[1].includes(p))) return paren[1].trim();

  for (const p of participants) {
    // 한 글자 이름(김, 이…)은 다른 단어에 우연히 포함되기 쉬워 앞뒤 경계를 요구한다.
    const head = p.length === 1 ? `(^|[\\s(（→>\\-])${p}` : p;
    const re = new RegExp(`${head}\\s*(이|가|은|는|님|씨)?[^\\n]{0,14}?(맡|담당|처리|진행|확인|작업|하기로|해서)`);
    if (re.test(line)) return p;
  }
  return null;
}

function guessDue(line: string): string | null {
  const md = line.match(/(\d{1,2})\s*[/.월]\s*(\d{1,2})/);
  if (md) return `${Number(md[1])}/${Number(md[2])}`;

  const now = new Date();
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const plus = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };

  if (/오늘/.test(line)) return fmt(now);
  if (/내일/.test(line)) return fmt(plus(1));
  if (/모레/.test(line)) return fmt(plus(2));
  if (/이번\s*주/.test(line)) return fmt(plus(Math.max(5 - now.getDay(), 1)));
  if (/다음\s*주/.test(line)) return fmt(plus(7));
  if (/이번\s*달/.test(line)) return fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return null;
}

const DUE_HINT = /(오늘|내일|모레|이번\s*주|다음\s*주|이번\s*달|\d{1,2}\s*[/.월]\s*\d{1,2}|까지)/;

/** 제목에서 담당자·기한 정보를 담은 "→ …" 꼬리를 잘라낸다. */
function stripAssignmentTail(line: string, participants: string[]): string {
  const idx = line.search(/\s*(→|->|:|;)\s*/);
  if (idx <= 0) return line;
  const tail = line.slice(idx);
  const carriesMeta = DUE_HINT.test(tail) || participants.some((p) => tail.includes(p)) || /@[A-Za-z0-9_-]+/.test(tail);
  return carriesMeta ? line.slice(0, idx) : line;
}

function cleanTitle(line: string, participants: string[] = []): string {
  return stripAssignmentTail(line.replace(BULLET, ''), participants)
    .replace(/@[A-Za-z0-9_-]+/g, '')
    .replace(/[（(][^)）]{1,12}[)）]\s*$/, '')
    .replace(/\s*(하기로 함|하기로 했다|하기로|해야 함|합니다|필요함|필요|바랍니다)\.?\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toIssueTitle(raw: string, participants: string[]): string {
  const t = cleanTitle(raw, participants).replace(/^\s*(→|->)\s*/, '');
  if (!t) return '후속 작업';
  return t.length > 70 ? `${t.slice(0, 68)}…` : t;
}

function buildAc(title: string, label: string): string[] {
  if (label === 'bug') {
    return [`${title} 재현 시나리오에서 오류가 발생하지 않는다`, '회귀 테스트 케이스가 추가되었다'];
  }
  if (label === 'chore') {
    return ['변경 후 기존 파이프라인이 동일하게 동작한다', '불필요한 코드/스크립트가 제거되었다'];
  }
  if (label === 'documentation') {
    return ['문서에 변경 사항이 반영되었다', '예시 코드가 실제 동작과 일치한다'];
  }
  return [`${title} 기능이 정상 동작한다`, '주요 경로에 대한 테스트가 통과한다'];
}

export interface ExtractResult {
  decisions: Decision[];
  tasks: TaskItem[];
  participants: string[];
}

/**
 * 회의록 원문에서 결정사항과 할 일을 추출한다.
 * (mock 모드 전용 휴리스틱 — 실제 서비스에서는 추출 에이전트가 이 역할을 한다)
 */
export function extractFromText(text: string): ExtractResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const participants: string[] = [];
  const pline = lines.find((l) => /^(참석|참여|attendees)\s*[:：]/i.test(l));
  if (pline) {
    pline.split(/[:：]/).slice(1).join(':').split(/[,、·/\s]+/).forEach((p) => {
      const name = p.replace(/[^가-힣A-Za-z0-9_-]/g, '').trim();
      if (name && name.length <= 12) participants.push(name);
    });
  }

  const decisions: Decision[] = [];
  const tasks: TaskItem[] = [];

  for (const line of lines) {
    if (NOISE.test(line)) continue;
    const isBullet = BULLET.test(line);
    const body = line.replace(BULLET, '');
    if (body.length < 4) continue;

    if (DECISION_HINT.test(body)) {
      decisions.push({ text: cleanTitle(body) });
      continue;
    }
    if (isBullet || ACTION_HINT.test(body)) {
      tasks.push({
        title: toIssueTitle(body, participants),
        assignee: guessAssignee(body, participants),
        due: guessDue(body),
        evidence: body.length > 90 ? `${body.slice(0, 88)}…` : body,
      });
    }
  }

  return { decisions: decisions.slice(0, 6), tasks: tasks.slice(0, 8), participants };
}

export function tasksToDrafts(tasks: TaskItem[], repo: string): Draft[] {
  return tasks.map((t, i) => {
    const label = guessLabel(`${t.title} ${t.evidence}`);
    return {
      id: `d${i + 1}`,
      title: t.title,
      body: [
        '> 🤖 AI가 회의록에서 생성한 초안입니다. 검토 후 수정하세요.',
        '',
        '## 배경',
        `${repo} 회의에서 도출된 후속 작업입니다.`,
        '',
        '## 회의록 근거',
        `> ${t.evidence}`,
      ].join('\n'),
      labels: [label],
      assignee: t.assignee,
      due: t.due,
      ac: buildAc(t.title, label).map((text) => ({ text, done: false })),
      evidence: t.evidence,
      selected: true,
      warnings: [],
    };
  });
}

/** 검수 에이전트: 기한/담당자/AC 품질과 중복을 점검해 경고를 만든다. */
export function reviewDrafts(drafts: Draft[]): { draftId: string; warnings: string[] }[] {
  const seen = new Map<string, string>();
  return drafts.map((d) => {
    const warnings: string[] = [];
    if (!d.due) warnings.push('기한이 명시되지 않았습니다');
    if (!d.assignee) warnings.push('담당자가 지정되지 않았습니다');
    if (d.title.replace(/\s/g, '').length < 6) warnings.push('제목이 모호합니다 — 무엇을 어떻게 할지 구체화하세요');
    if (d.ac.length < 2) warnings.push('완료 조건이 부족합니다');

    const key = d.title.replace(/\s/g, '').slice(0, 10);
    const dup = seen.get(key);
    if (dup) warnings.push(`"${dup}" 항목과 중복일 수 있습니다`);
    else seen.set(key, d.title);

    return { draftId: d.id, warnings };
  });
}
