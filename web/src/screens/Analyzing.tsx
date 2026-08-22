import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Banner, Stepper } from '../components/ui';
import type { AgentId, AgentState } from '../types';

const ICON: Record<AgentState['status'], string> = {
  idle: '○', running: '⏳', done: '✅', error: '⛔',
};

export default function Analyzing() {
  const nav = useNavigate();
  const { session, setSession } = useStore();
  const [tab, setTab] = useState<AgentId>('extractor');
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!session.repo || !session.meetingText) { nav('/issues'); return; }

    const ac = new AbortController();
    abortRef.current = ac;
    setSession((s) => ({ ...s, startedAt: Date.now(), finishedAt: null, error: null }));

    const patchAgent = (id: AgentId, patch: Partial<AgentState>) =>
      setSession((s) => ({
        ...s,
        agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));

    (async () => {
      try {
        for await (const ev of api.analyze(
          { repo: session.repo, text: session.meetingText },
          ac.signal,
        )) {
          switch (ev.type) {
            case 'agent_start':
              setTab(ev.agent);
              patchAgent(ev.agent, { status: 'running', note: '실행 중…', progress: undefined });
              break;
            case 'token':
              setSession((s) => ({
                ...s,
                transcript: { ...s.transcript, [ev.agent]: (s.transcript[ev.agent] ?? '') + ev.text },
              }));
              break;
            case 'progress':
              patchAgent(ev.agent, { note: ev.note, progress: ev.progress });
              break;
            case 'decisions':
              setSession((s) => ({ ...s, decisions: ev.items }));
              break;
            case 'tasks':
              setSession((s) => ({ ...s, tasks: ev.items }));
              break;
            case 'drafts':
              setSession((s) => ({ ...s, drafts: ev.items }));
              break;
            case 'review':
              setSession((s) => ({
                ...s,
                drafts: s.drafts.map((d) => ({
                  ...d,
                  warnings: ev.items.find((r) => r.draftId === d.id)?.warnings ?? [],
                })),
              }));
              break;
            case 'agent_done':
              patchAgent(ev.agent, { status: 'done', note: ev.note, ms: ev.ms, progress: 1 });
              break;
            case 'error':
              patchAgent(ev.agent, { status: 'error', note: ev.message });
              setSession((s) => ({ ...s, error: ev.message }));
              break;
            case 'done':
              setSession((s) => ({ ...s, finishedAt: Date.now() }));
              setRunning(false);
              setTimeout(() => nav('/review'), 550);
              break;
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setSession((s) => ({ ...s, error: String((e as Error).message ?? e) }));
        setRunning(false);
      }
    })();

    return () => ac.abort();
    // 세션 1회 실행 — 의존성은 의도적으로 비움
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [session.transcript]);

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
    setSession((s) => ({
      ...s,
      agents: s.agents.map((a) => (a.status === 'running' ? { ...a, status: 'idle', note: '사용자가 중단함' } : a)),
    }));
  };

  const doneCount = session.agents.filter((a) => a.status === 'done').length;

  return (
    <div className="page wide">
      <div className="between wrap" style={{ marginBottom: 16, gap: 10 }}>
        <Stepper current={2} />
        <div className="row">
          {running
            ? <button className="btn danger" onClick={stop}>■ 중단</button>
            : <button className="btn" onClick={() => nav('/new')}>← 입력으로</button>}
          {!running && session.drafts.length > 0 && (
            <button className="btn primary" onClick={() => nav('/review')}>검토 단계로 →</button>
          )}
        </div>
      </div>

      {session.error && (
        <Banner kind="err">
          분석 중 오류가 발생했습니다: {session.error}
          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => nav('/new')}>다시 시도</button>
          </div>
        </Banner>
      )}

      <div className="analyze-grid">
        <div>
          <div className="xs muted" style={{ marginBottom: 6 }}>
            에이전트 진행 (순차 오케스트레이션) · {doneCount}/3 완료
          </div>
          {session.agents.map((a) => (
            <div
              key={a.id}
              className={`agent ${a.status === 'running' ? 'running' : a.status === 'idle' ? 'idle' : a.status === 'error' ? 'error' : ''}`}
              onClick={() => setTab(a.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="t">
                <span aria-hidden>{ICON[a.status]}</span>
                <span aria-hidden>{a.icon}</span>
                {a.name}
                {a.ms !== undefined && <span className="xs muted" style={{ marginLeft: 'auto' }}>{(a.ms / 1000).toFixed(1)}초</span>}
              </div>
              <div className="m">{a.note}</div>
              {a.status === 'running' && a.progress !== undefined && (
                <div className="prog"><i style={{ width: `${Math.round(a.progress * 100)}%` }} /></div>
              )}
            </div>
          ))}

          <div className="card" style={{ marginTop: 12, padding: '11px 13px' }}>
            <div className="xs muted">추출 결과 요약</div>
            <div className="sm" style={{ marginTop: 6 }}>
              결정사항 <b>{session.decisions.length}</b>건 · 할 일 <b>{session.tasks.length}</b>건 · 초안 <b>{session.drafts.length}</b>건
            </div>
          </div>
        </div>

        <div>
          <div className="tabs" style={{ marginBottom: 8 }}>
            {session.agents.map((a) => (
              <button key={a.id} className={tab === a.id ? 'on' : ''} onClick={() => setTab(a.id)}>
                {a.icon} {a.name.replace(' 에이전트', '')}
              </button>
            ))}
          </div>
          <div className="stream" ref={logRef} style={{ maxHeight: 420, overflow: 'auto' }}
            role="status" aria-live="polite">
            <pre>
              {session.transcript[tab] || '대기 중…'}
              {running && <span className="caret" aria-hidden />}
            </pre>
          </div>
          <div className="banner info" style={{ marginTop: 12 }}>
            <span aria-hidden>🤖</span>
            <div>AI가 생성 중입니다. 모든 결과는 다음 단계에서 검토·승인한 뒤에만 GitHub에 반영됩니다.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
