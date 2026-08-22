import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Badge, Banner, Empty, Stepper } from '../components/ui';
import DraftEditor from './DraftEditor';
import type { Draft } from '../types';

export default function Review() {
  const nav = useNavigate();
  const { session, setSession, toast } = useStore();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  const drafts = session.drafts;
  const selected = drafts.filter((d) => d.selected);
  const warnCount = useMemo(
    () => drafts.reduce((n, d) => n + d.warnings.length, 0),
    [drafts],
  );

  if (!session.repo) return <Navigate to="/issues" replace />;

  const patch = (id: string, p: Partial<Draft>) =>
    setSession((s) => ({ ...s, drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...p } : d)) }));

  const remove = (id: string) =>
    setSession((s) => ({ ...s, drafts: s.drafts.filter((d) => d.id !== id) }));

  const toggleAll = (v: boolean) =>
    setSession((s) => ({ ...s, drafts: s.drafts.map((d) => ({ ...d, selected: v })) }));

  const approve = async () => {
    setCreating(true);
    try {
      const results = await api.createIssues(session.repo, selected);
      setSession((s) => ({ ...s, results, finishedAt: Date.now() }));
      nav('/result');
    } catch (e) {
      toast(`이슈 생성 실패: ${(e as Error).message}`, 'err');
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="between wrap" style={{ marginBottom: 16, gap: 10 }}>
        <Stepper current={3} />
        <span className="badge ai">🤖 AI 생성 초안</span>
      </div>

      {drafts.length === 0 ? (
        <Empty icon="🗒" title="검토할 초안이 없습니다" hint="회의록을 다시 입력해 분석해 보세요" />
      ) : (
        <>
          {warnCount > 0 ? (
            <Banner kind="warn">
              검수 결과 — 지적사항 <b>{warnCount}건</b>. 생성 전에 확인하세요.
            </Banner>
          ) : (
            <Banner kind="ok">검수 통과 — 지적사항이 없습니다.</Banner>
          )}

          <div className="between wrap" style={{ marginBottom: 10 }}>
            <div className="row">
              <b>이슈 초안 {drafts.length}건</b>
              <button className="btn sm ghost" onClick={() => toggleAll(selected.length !== drafts.length)}>
                {selected.length === drafts.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <span className="xs muted">선택 {selected.length}건</span>
          </div>

          {drafts.map((d) => (
            <div key={d.id} className={`draft ${d.selected ? 'on' : 'off'}`}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <label className="chk" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={d.selected}
                    onChange={(e) => patch(d.id, { selected: e.target.checked })} />
                  <span>
                    <h4>{d.title}</h4>
                    <div className="meta">
                      {d.labels.map((l) => <Badge key={l} label={l} />)}
                      <span>{d.assignee ? `@${d.assignee}` : '담당자 —'}</span>
                      <span>기한 {d.due ?? '—'}</span>
                    </div>
                  </span>
                </label>
                <div className="row">
                  <button className="btn sm" onClick={() => setEditing(d)}>✏️ 수정</button>
                  <button className="btn sm danger" onClick={() => remove(d.id)}>🗑 제외</button>
                </div>
              </div>

              {d.warnings.map((w) => (
                <div className="flag" key={w}>
                  <span aria-hidden>⚠️</span>
                  <span>{w}</span>
                  <span className="spacer" />
                  <button className="btn sm" onClick={() => setEditing(d)}>수정하기</button>
                </div>
              ))}

              <button className="btn sm ghost" style={{ marginTop: 8, paddingLeft: 0 }}
                onClick={() => setOpen((o) => ({ ...o, [d.id]: !o[d.id] }))}>
                {open[d.id] ? '▾' : '▸'} 완료 조건 {d.ac.length} · 근거
              </button>

              {open[d.id] && (
                <>
                  <div className="ac">
                    <b>완료 조건 (AC)</b>
                    <ul>{d.ac.map((a, i) => <li key={i}>{a.text}</li>)}</ul>
                  </div>
                  <div className="quote">📄 회의록 근거 — “{d.evidence}”</div>
                </>
              )}
            </div>
          ))}

          <div className="between wrap" style={{ marginTop: 18, gap: 10 }}>
            <span className="xs muted">
              선택한 <b>{selected.length}건</b>이 <b>{session.repo}</b>에 생성됩니다.
              승인 전까지 GitHub에는 아무것도 반영되지 않습니다.
            </span>
            <div className="row">
              <button className="btn" onClick={() => nav('/new')}>← 다시 분석</button>
              <button className="btn go" disabled={selected.length === 0 || creating} onClick={approve}>
                {creating ? '생성 중…' : `✅ 승인 및 생성 (${selected.length}건)`}
              </button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <DraftEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={(d) => {
            const warnings = d.warnings.filter((w) => {
              if (w.includes('기한')) return !d.due;
              if (w.includes('담당자')) return !d.assignee;
              if (w.includes('완료 조건')) return d.ac.length < 2;
              if (w.includes('제목')) return d.title.replace(/\s/g, '').length < 6;
              return true;
            });
            patch(d.id, { ...d, warnings });
            setEditing(null);
            toast('초안이 수정되었습니다');
          }}
        />
      )}
    </div>
  );
}
