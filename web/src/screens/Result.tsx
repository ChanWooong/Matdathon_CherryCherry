import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Stepper } from '../components/ui';

/** 이슈 1건을 손으로 옮겨 적는 데 걸린다고 가정하는 시간(초) */
const MANUAL_SEC_PER_ISSUE = 9 * 60;

export default function Result() {
  const nav = useNavigate();
  const { session, setNewIssueNumbers } = useStore();
  const results = session.results;

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const elapsedSec = session.startedAt && session.finishedAt
    ? Math.max(1, Math.round((session.finishedAt - session.startedAt) / 1000))
    : 0;
  const manualSec = Math.max(results.length, 1) * MANUAL_SEC_PER_ISSUE;
  const saved = elapsedSec ? Math.round((1 - elapsedSec / manualSec) * 100) : 0;

  useEffect(() => {
    if (results.length === 0) nav('/issues');
    else setNewIssueNumbers(ok.map((r) => r.number!).filter(Boolean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const excluded = session.drafts.filter((d) => !d.selected);

  return (
    <div className="page">
      <div style={{ marginBottom: 16 }}><Stepper current={4} /></div>

      <div className="center">
        <div style={{ fontSize: 36 }}>{failed.length ? '⚠️' : '✅'}</div>
        <h2 style={{ margin: '6px 0 4px', fontSize: 19 }}>
          이슈 {ok.length}건이 생성되었습니다
          {failed.length > 0 && <span className="muted"> · {failed.length}건 실패</span>}
        </h2>
        <p className="muted xs" style={{ margin: 0 }}>{session.repo}</p>
      </div>

      <div className="list" style={{ maxWidth: 620, margin: '20px auto 0' }}>
        {ok.map((r) => (
          <div className="item between" key={r.draftId}>
            <span>✅ <b>#{r.number}</b> {r.title}</span>
            <a className="btn sm" href={r.url} target="_blank" rel="noreferrer">열기 ↗</a>
          </div>
        ))}
        {failed.map((r) => (
          <div className="item between" key={r.draftId} style={{ background: 'var(--danger-soft)' }}>
            <span>❌ {r.title} <span className="xs muted">— {r.error}</span></span>
            <button className="btn sm">재시도</button>
          </div>
        ))}
        {excluded.map((d) => (
          <div className="item between" key={d.id} style={{ background: 'var(--warn-soft)' }}>
            <span>⚠️ {d.title} — 사용자가 제외함</span>
          </div>
        ))}
      </div>

      <div className="kpis">
        <div className="center"><b>{elapsedSec}초</b><span>실제 소요</span></div>
        <div className="center"><b>{Math.round(manualSec / 60)}분</b><span>수작업 예상</span></div>
        <div className="center" style={{ borderColor: 'var(--ok-line)', background: 'var(--ok-soft)' }}>
          <b style={{ color: 'var(--ok)' }}>{saved}%</b><span>시간 절감</span>
        </div>
      </div>

      <div className="row center" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => nav('/issues')}>이슈 목록으로</button>
        <button className="btn primary" onClick={() => nav('/new')}>새 회의록 분석</button>
      </div>

      <p className="xs muted center" style={{ marginTop: 18 }}>
        🔒 회의록 원문은 저장되지 않았습니다.
      </p>
    </div>
  );
}
