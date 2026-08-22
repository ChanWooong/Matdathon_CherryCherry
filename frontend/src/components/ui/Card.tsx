import type { ReactNode } from 'react';
import s from './Card.module.css';

interface CardProps {
  children: ReactNode;
  pad?: boolean;
  className?: string;
}

export function Card({ children, pad, className }: CardProps) {
  return <div className={[s.card, pad && s.pad, className].filter(Boolean).join(' ')}>{children}</div>;
}

interface HeadProps {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

export function CardHead({ title, sub, actions }: HeadProps) {
  return (
    <div className={s.head}>
      <span className={s.headTitle}>{title}</span>
      {sub && <span className={s.headSub}>{sub}</span>}
      {actions}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.body, className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardFoot({ children }: { children: ReactNode }) {
  return <div className={s.foot}>{children}</div>;
}
