import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../ui';
import s from './Page.module.css';

interface PageProps {
  children: ReactNode;
  width?: 'narrow' | 'default' | 'wide';
}

export function Page({ children, width = 'default' }: PageProps) {
  const cls = [s.page, width === 'narrow' && s.narrow, width === 'wide' && s.wide]
    .filter(Boolean).join(' ');
  return <main className={cls}>{children}</main>;
}

interface HeadProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
}

export function PageHead({ eyebrow, title, desc, actions }: HeadProps) {
  return (
    <div className={s.head}>
      <div className={s.headMain}>
        {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
        <h1 className={s.title}>{title}</h1>
        {desc && <p className={s.desc}>{desc}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={s.back}>
      <Icon name="arrow-left" size={14} />
      {children}
    </Link>
  );
}

interface SectionProps {
  title?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Section({ title, note, actions, children }: SectionProps) {
  return (
    <section className={s.section}>
      {(title || actions) && (
        <div className={s.sectionHead}>
          {title && <span className={s.sectionTitle}>{title}</span>}
          {note && <span className={s.sectionNote}>{note}</span>}
          {!note && <span className={s.sectionNote} />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
