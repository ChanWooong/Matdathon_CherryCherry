import type { ReactNode } from 'react';
import s from './List.module.css';

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.list, className].filter(Boolean).join(' ')}>{children}</div>;
}

interface RowProps {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function ListRow({ lead, title, meta, trail, onClick, selected, className }: RowProps) {
  const cls = [s.row, onClick && s.clickable, selected && s.selected, className].filter(Boolean).join(' ');
  const inner = (
    <>
      {lead && <span className={s.lead}>{lead}</span>}
      <span className={s.main}>
        <span className={s.title}>{title}</span>
        {meta && <span className={s.meta}>{meta}</span>}
      </span>
      {trail && <span className={s.trail}>{trail}</span>}
    </>
  );

  if (!onClick) return <div className={cls}>{inner}</div>;

  // trail 안에 버튼이 들어가는 경우가 많아 button 중첩을 피하려고 div + role 을 쓴다
  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {inner}
    </div>
  );
}

interface BarProps {
  title?: ReactNode;
  count?: number;
  children?: ReactNode;
}

export function ListBar({ title, count, children }: BarProps) {
  return (
    <div className={s.bar}>
      {title && <span className={s.barTitle}>{title}</span>}
      {count !== undefined && <span className={s.count}>{count}개</span>}
      {children}
    </div>
  );
}
