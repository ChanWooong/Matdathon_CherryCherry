import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Empty, Loading } from '../components/ui';
import type { PullRequest } from '../types';

export default function PrList() {
  const nav = useNavigate();
  const { repo } = useStore();
  const [prs, setPrs] = useState<PullRequest[] | null>(null);
  const [author, setAuthor] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!repo) return;
    setPrs(null);
    api.listPullRequests(repo.fullName).then(setPrs).catch(() => setPrs([]));
  }, [repo]);

  const authors = useMemo(() => Array.from(new Set((prs ?? []).map((p) => p.author))), [prs]);
  const filtered = (prs ?? []).filter((p) =>
    (author === 'all' || p.author === author)
    && (!q || p.title.toLowerCase().includes(q.toLowerCase())));

  if (!repo) return null;

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <b>열린 PR {prs?.length ?? '—'}건</b>
        <select className="field" style={{ width: 'auto' }} value={author} onChange={(e) => setAuthor(e.target.value)}>
          <option value="all">모든 작성자</option>
          {authors.map((a) => <option key={a} value={a}>@{a}</option>)}
        </select>
        <input className="field" style={{ width: 180 }} placeholder="🔍 PR 검색"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {prs === null ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="🔀" title="열린 PR이 없습니다" />
      ) : (
        <div className="list">
          {filtered.map((p) => (
            <div className="item between" key={p.number}>
              <div>
                <b>🔀 #{p.number} {p.title}</b>
                <div className="xs muted" style={{ marginTop: 4 }}>
                  @{p.author} · <span style={{ color: 'var(--ok)' }}>+{p.additions}</span>{' '}
                  <span style={{ color: 'var(--danger)' }}>−{p.deletions}</span> ·{' '}
                  {p.linkedIssue ? `🔗 이슈 #${p.linkedIssue} 연결` : '연결 이슈 없음'}
                </div>
              </div>
              <button
                className={`btn sm ${p.linkedIssue ? 'primary' : ''}`}
                onClick={() => nav(`/pulls/${p.number}`, { state: p })}
              >
                AI 리뷰 ▸
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="xs muted" style={{ marginTop: 10 }}>
        💡 연결 이슈가 없으면 요구사항 대조 대신 코드 품질·요약 에이전트만 실행됩니다.
      </p>
    </div>
  );
}
