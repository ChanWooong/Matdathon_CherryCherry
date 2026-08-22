import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './HoverMenu.module.css';

type Placement = 'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft';

interface Props {
  /** 트리거 렌더러. open 상태를 받아 화살표 방향 등을 바꿀 수 있다. */
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  placement?: Placement;
  /** 호버가 아니라 클릭으로만 열고 싶을 때 */
  clickOnly?: boolean;
  className?: string;
}

/**
 * 마우스를 올리면 열리는 메뉴. 키보드 사용자를 위해 클릭/포커스로도 열린다.
 * 닫을 때 약간의 지연을 둬서 커서가 메뉴로 이동하는 중에 닫히지 않게 한다.
 */
export function HoverMenu({ trigger, children, placement = 'bottomRight', clickOnly, className }: Props) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cancelClose = () => window.clearTimeout(timer.current);
  const scheduleClose = () => {
    cancelClose();
    timer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={[s.wrap, className].filter(Boolean).join(' ')}
      onMouseEnter={clickOnly ? undefined : () => { cancelClose(); setOpen(true); }}
      onMouseLeave={clickOnly ? undefined : scheduleClose}
    >
      <div onClick={() => setOpen((v) => !v)} onFocus={() => setOpen(true)}>
        {trigger(open)}
      </div>
      {open && (
        <div className={[s.menu, s[placement]].join(' ')} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  icon?: IconName;
  children: ReactNode;
  desc?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function MenuItem({ icon, children, desc, onClick, disabled }: ItemProps) {
  return (
    <button type="button" role="menuitem" className={s.item} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={16} />}
      <span className={s.itemBody}>
        <span>{children}</span>
        {desc && <span className={s.itemDesc}>{desc}</span>}
      </span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={s.label}>{children}</div>;
}

export function MenuSep() {
  return <div className={s.sep} />;
}
