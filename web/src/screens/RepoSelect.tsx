import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Empty, Loading } from '../components/ui';
import type { Repo } from '../types';

export default function RepoSelect() {
  const nav = useNavigate();
  const { setRepo, toast } = useStore();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listRepos()
      .then(setRepos)
      .catch((e) => { setErr(String(e.message ?? e)); setRepos([]); });
  }, []);

  const filtered = useMemo(
    () => (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q.trim().toLowerCase())),
    [repos, q],
  );
  const recent = filtered.filter((r) => r.lastUsed);
  const others = filtered.filter((r) => !r.lastUsed);

  const pick = (r: Repo) => {
    setRepo(r);
    toast(`${r.fullName} 선택됨`);
    nav('/issues');
  };

  const Row = (r: Repo) => (
    <div className="item clickable between" key={r.id} onClick={() => pick(r)}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') pick(r); }}>
      <div>
        <b>{r.starred ? '⭐ ' : '📦 '}{r.fullName}</b>
        <div className="xs muted" style={{ marginTop: 3 }}>
          이슈 {r.issues} · PR {r.prs}{r.lastUsed ? ` · ${r.lastUsed} 사용` : ''}
        </div>
      </div>
      <span className="muted">→</span>
    </div>
  );

  return (
    <div className="page">
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>리포지토리를 선택하세요</h2>
      <p className="muted xs" style={{ margin: '0 0 16px' }}>
        회의록으로 이슈를 만들 대상 리포입니다. 선택한 리포는 다음 방문 때 기억됩니다.
      </p>

      <input
        className="field"
        placeholder="🔍 리포 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 18 }}
        autoFocus
      />

      {err && (
        <div className="banner err">⛔ 리포 목록을 불러오지 못했습니다: {err}</div>
      )}

      {repos === null ? <Loading rows={4} /> : filtered.length === 0 ? (
        <Empty icon="🔍" title="일치하는 리포가 없습니다" hint="검색어를 지우거나 GitHub 권한을 확인하세요" />
      ) : (
        <>
          {recent.length > 0 && (
            <>
              <div className="xs muted" style={{ margin: '0 0 6px' }}>최근 사용</div>
              <div className="list" style={{ marginBottom: 18 }}>{recent.map(Row)}</div>
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="xs muted" style={{ margin: '0 0 6px' }}>전체 리포</div>
              <div className="list">{others.map(Row)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
