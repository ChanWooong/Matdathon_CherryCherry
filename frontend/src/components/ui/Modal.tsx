import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import s from './Modal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 왼쪽 아래에 표시할 보조 문구 (선택 개수 등) */
  footerNote?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, sub, children, footer, footerNote, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={[s.panel, wide && s.wide].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.head}>
          <div style={{ marginRight: 'auto' }}>
            <div className={s.title}>{title}</div>
            {sub && <div className={s.sub}>{sub}</div>}
          </div>
          <IconButton name="x" label="닫기" onClick={onClose} />
        </div>
        <div className={s.body}>{children}</div>
        {(footer || footerNote) && (
          <div className={s.foot}>
            <span className={s.footSpacer}>{footerNote}</span>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
