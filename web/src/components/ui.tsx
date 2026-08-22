import type { ReactNode } from 'react';

export function Badge({ label, kind }: { label: string; kind?: string }) {
  return <span className={`badge ${kind ?? label}`}>{label}</span>;
}

export function AiBadge({ text = '🤖 AI 생성' }: { text?: string }) {
  return <span className="badge ai">{text}</span>;
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'ok' | 'err'; children: ReactNode }) {
  const icon = { info: 'ℹ️', warn: '⚠️', ok: '✅', err: '⛔' }[kind];
  return (
    <div className={`banner ${kind}`}>
      <span aria-hidden>{icon}</span>
      <div>{children}</div>
    </div>
  );
}

const STEP_LABELS = ['입력', '분석', '검토', '생성'];

export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="steps" aria-label={`4단계 중 ${current}단계`}>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'now' : '';
        return (
          <span key={label} style={{ display: 'contents' }}>
            {i > 0 && <i className="bar" />}
            <span className={`s ${state}`}>
              {n < current ? '✓' : `${'①②③④'[i]}`} {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function Modal({
  title, children, onClose, footer,
}: { title: string; children: ReactNode; onClose(): void; footer?: ReactNode }) {
  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>{title}</header>
        <div className="content">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 30 }}>{icon}</div>
      <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {hint && <div className="xs" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="list">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="item" key={i}>
          <div className="skeleton" style={{ width: `${60 + (i % 3) * 12}%` }} />
          <div className="skeleton" style={{ width: '30%', marginTop: 8, height: 10 }} />
        </div>
      ))}
    </div>
  );
}
