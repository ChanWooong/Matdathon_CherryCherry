import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { AiBadge, Badge, Empty, Loading } from '../components/ui';
import type { Issue } from '../types';

export default function IssueList() {
  const nav = useNavigate();
  const { repo, newIssueNumbers } = useStore();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [state, setState] = useState<'all' | 'open' | 'closed'>('open');
  const [label, setLabel] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!repo) return;
    setIssues(null);
    api.listIssues(repo.fullName).then(setIssues).catch(() => setIssues([]));
  }, [repo]);

  const labels = useMemo(
    () => Array.from(new Set((issues ?? []).flatMap((i) => i.labels))),
    [issues],
  );

  const filtered = useMemo(() => (issues ?? []).filter((i) => {
    if (state !== 'all' && i.state !== state) return false;
    if (label !== 'all' && !i.labels.includes(label)) return false;
    if (q && !i.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [issues, state, label, q]);

  if (!repo) return null;

  return (
    <div className="page">
      <div className="between wrap" style={{ marginBottom: 14, gap: 10 }}>
        <div className="row wrap">
          <b>이슈 {issues?.length ?? '—'}건</b>
          <select className="field" style={{ width: 'auto' }} value={state}
            onChange={(e) => setState(e.target.value as typeof state)}>
            <option value="open">열림</option>
            <option value="closed">닫힘</option>
            <option value="all">전체</option>
          </select>
          <select className="field" style={{ width: 'auto' }} value={label}
            onChange={(e) => setLabel(e.target.value)}>
            <option value="all">모든 라벨</option>
            {labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <input className="field" style={{ width: 180 }} placeholder="🔍 이슈 검색"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn primary" onClick={() => nav('/new')}>
          ✨ 회의록으로 이슈 만들기
        </button>
      </div>

      {issues === null ? <Loading /> : filtered.length === 0 ? (
        <Empty
          title="조건에 맞는 이슈가 없습니다"
          hint="회의록을 붙여넣어 첫 이슈를 만들어 보세요"
        />
      ) : (
        <div className="list">
          {filtered.map((i) => (
            <div key={i.number} className={`item ${newIssueNumbers.includes(i.number) ? 'flash' : ''}`}>
              <div className="row wrap">
                <span aria-hidden style={{ color: i.state === 'open' ? 'var(--ok)' : 'var(--mute)' }}>
                  {i.state === 'open' ? '○' : '●'}
                </span>
                <b>#{i.number} {i.title}</b>
                {i.labels.map((l) => <Badge key={l} label={l} />)}
                {i.aiGenerated && <AiBadge />}
              </div>
              <div className="xs muted" style={{ marginTop: 4 }}>
                {i.assignee ? `@${i.assignee}` : '담당자 없음'} · {i.updatedAt}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
