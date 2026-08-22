import type { ReactNode } from 'react';
import s from './Tag.module.css';

export type TagTone = 'neutral' | 'clay' | 'moss' | 'ochre' | 'brick' | 'slate' | 'sunk';

interface Props {
  tone?: TagTone;
  dot?: boolean;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}

export function Tag({ tone = 'neutral', dot, mono, children, className }: Props) {
  const cls = [s.tag, tone !== 'neutral' && s[tone], mono && s.mono, className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className={s.dot} />}
      {children}
    </span>
  );
}
