import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './Tabs.module.css';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: IconName;
  count?: number;
}

interface Props<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** 탭 줄 오른쪽에 붙일 액션 */
  after?: ReactNode;
}

export function Tabs<T extends string>({ items, value, onChange, after }: Props<T>) {
  return (
    <div className={s.tabs} role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          className={[s.tab, t.id === value && s.active].filter(Boolean).join(' ')}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <Icon name={t.icon} size={15} />}
          {t.label}
          {t.count !== undefined && <span className={s.badge}>{t.count}</span>}
        </button>
      ))}
      {after && <span className={s.after}>{after}</span>}
    </div>
  );
}
