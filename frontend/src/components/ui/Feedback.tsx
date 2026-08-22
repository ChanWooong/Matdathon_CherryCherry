import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import s from './Feedback.module.css';

export type Tone = 'info' | 'success' | 'warn' | 'error';

const TONE_ICON: Record<Tone, IconName> = {
  info: 'dot',
  success: 'check-circle',
  warn: 'alert',
  error: 'alert',
};

interface BannerProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
}

export function Banner({ tone = 'info', title, children, actions, icon }: BannerProps) {
  return (
    <div className={[s.banner, s[tone]].join(' ')}>
      <Icon name={icon ?? TONE_ICON[tone]} size={16} className={s.icon} />
      <div className={s.body}>
        {title && <div className={s.title}>{title}</div>}
        {children}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
}

/* ------------------------------- toast ---------------------------------- */

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

const ToastCtx = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, tone: Tone = 'info') => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => remove(id), 3600);
  }, [remove]);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {items.length > 0 && createPortal(
        <div className={s.toasts}>
          {items.map((t) => (
            <div
              key={t.id}
              className={[s.toast, t.tone === 'success' && s.toastOk, t.tone === 'error' && s.toastErr]
                .filter(Boolean).join(' ')}
              role="status"
            >
              <Icon name={TONE_ICON[t.tone]} size={16} className={s.icon} />
              <span>{t.message}</span>
              <button className={s.toastClose} onClick={() => remove(t.id)} aria-label="닫기">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
