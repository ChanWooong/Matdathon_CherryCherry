import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './EmptyState.module.css';

interface Props {
  icon?: IconName;
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
  flat?: boolean;
}

export function EmptyState({ icon, title, desc, action, flat }: Props) {
  return (
    <div className={[s.empty, flat && s.flat].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} size={26} className={s.icon} />}
      <span className={s.title}>{title}</span>
      {desc && <span className={s.desc}>{desc}</span>}
      {action && <span className={s.action}>{action}</span>}
    </div>
  );
}
