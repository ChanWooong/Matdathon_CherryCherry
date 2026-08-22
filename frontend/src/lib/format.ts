/** 화면에서 반복되는 표시 형식들 */

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.round(hour / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' });
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

/** 회의록 미리보기용 한 줄 요약 */
export function preview(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function countLines(text: string): number {
  return text.trim() ? text.trim().split('\n').length : 0;
}

export function initials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return /[가-힣]/.test(t) ? t.slice(-2) : t.slice(0, 2).toUpperCase();
}
