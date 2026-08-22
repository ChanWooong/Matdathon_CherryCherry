import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Banner } from '../components/ui';
import type { PullRequest, ReviewAgentId, ReviewSection } from '../types';

const INITIAL: ReviewSection[] = [
  { agent: 'requirements', name: '요구사항 대조', icon: '📋', status: 'idle', findings: [], adopted: true },
  { agent: 'quality', name: '코드 품질', icon: '🔎', status: 'idle', findings: [], adopted: true },
  { agent: 'summary', name: '변경 요약 · 학습 포인트', icon: '📄', status: 'idle', findings: [], adopted: false },
];

const MARK: Record<string, string> = { pass: '✅', fail: '❌', warn: '⚠️', info: '💡' };

export default function PrReview() {
  const nav = useNavigate();
  const { number } = useParams();
  const { state } = useLocation() as { state: PullRequest | null };
  const { repo, toast } = useStore();
  const [sections, setSections] = useState<ReviewSection[]>(INITIAL.map((s) => ({ ...s })));
  const [running, setRunning] = useState(true);
  const [posted, setPosted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pr: PullRequest = state ?? {
    number: Number(number), title: `PR #${number}`, author: '-', additions: 0, deletions: 0, linkedIssue: null, url: '#',
  };

  useEffect(() => {
    if (!repo) { nav('/'); return; }
    const ac = new AbortController();
    abortRef.current = ac;

    const patch = (agent: ReviewAgentId, p: Partial<ReviewSection>) =>
      setSections((ss) => ss.map((s) => (s.agent === agent ? { ...s, ...p } : s)));

    (async () => {
      try {
        for await (const ev of api.reviewPullRequest(repo.fullName, pr, ac.signal)) {
          if (ev.type === 'agent_start') patch(ev.agent, { status: 'running' });
          else if (ev.type === 'findings') patch(ev.agent, { findings: ev.items });
          else if (ev.type === 'agent_done') patch(ev.agent, { status: 'done', ms: ev.ms, note: ev.note });
          else if (ev.type === 'error') { patch(ev.agent, { status: 'error', note: ev.message }); setErr(ev.message); }
          else if (ev.type === 'done') setRunning(false);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setErr(String((e as Error).message ?? e));
        setRunning(false);
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adopted = sections.filter((s) => s.adopted && s.findings.length > 0);

  const buildComment = () => [
    ...adopted.flatMap((s) => [
      `### ${s.icon} ${s.name}`,
      ...s.findings.map((f) => `- ${MARK[f.status]} ${f.text}${f.ref ? ` (\`${f.ref}\`)` : ''}`),
      '',
    ]),
    '---',
    '🤖 MeetToIssue AI가 생성한 리뷰입니다. 사용자가 확인 후 게시했습니다.',
  ].join('\n');

  const post = async () => {
    try {
      await api.postPrComment(repo!.fullName, pr.number, buildComment());
      setPosted(true);
      toast('PR에 코멘트를 게시했습니다');
    } catch (e) {
      toast(`게시 실패: ${(e as Error).message}`, 'err');
    }
  };

  return (
    <div className="page">
      <div className="between wrap" style={{ marginBottom: 14, gap: 8 }}>
        <button className="btn ghost sm" onClick={() => nav('/pulls')}>← PR 목록</button>
        <div className="row wrap">
          <b>#{pr.number} {pr.title}</b>
          {pr.linkedIssue
            ? <span className="badge ok">🔗 이슈 #{pr.linkedIssue}</span>
            : <span className="badge">연결 이슈 없음</span>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="xs muted" style={{ marginBottom: 6 }}>병렬 오케스트레이션</div>
        <div className="row wrap" style={{ gap: 16 }}>
          {sections.map((s) => (
            <span key={s.agent} className="sm">
              {s.status === 'done' ? '✅' : s.status === 'running' ? '⏳' : s.status === 'error' ? '⛔' : '○'}{' '}
              {s.icon} {s.name}
              {s.ms !== undefined && <span className="xs muted"> {(s.ms / 1000).toFixed(1)}초</span>}
            </span>
          ))}
        </div>
      </div>

      {err && <Banner kind="err">리뷰 중 오류: {err}</Banner>}

      {sections.map((s) => (
        <div key={s.agent} style={{ marginBottom: 16 }}>
          <div className="between" style={{ marginBottom: 6 }}>
            <b>{s.icon} {s.name} {s.findings.length > 0 && <span className="xs muted">{s.findings.length}건</span>}</b>
            <label className="chk xs">
              <input type="checkbox" checked={s.adopted} disabled={s.findings.length === 0}
                onChange={(e) => setSections((ss) => ss.map((x) => (x.agent === s.agent ? { ...x, adopted: e.target.checked } : x)))} />
              채택
            </label>
          </div>
          <div className="list">
            {s.findings.length === 0 ? (
              <div className="item xs muted">{s.status === 'running' ? <>분석 중<span className="caret" /></> : '결과 없음'}</div>
            ) : s.findings.map((f) => (
              <div className="item" key={f.id}>
                <span aria-hidden>{MARK[f.status]}</span> {f.text}
                {f.ref && <span className="xs muted"> → <code>{f.ref}</code></span>}
              </div>
            ))}
          </div>
          {s.agent === 'requirements' && s.findings.some((f) => f.status === 'fail') && (
            <div className="flag">⚠️ 회의에서 정한 완료 조건 중 미충족 항목이 있습니다</div>
          )}
        </div>
      ))}

      <Banner kind="info">
        AI가 생성한 리뷰입니다. 게시 전 반드시 확인하세요. 채택한 {adopted.length}개 섹션만 코멘트에 포함됩니다.
      </Banner>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(buildComment()); toast('리뷰 내용을 복사했습니다'); }}>
          복사
        </button>
        <button className="btn primary" disabled={running || adopted.length === 0 || posted} onClick={post}>
          {posted ? '게시 완료' : '💬 PR에 코멘트 게시'}
        </button>
      </div>
    </div>
  );
}
