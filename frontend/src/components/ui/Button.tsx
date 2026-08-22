import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './Button.module.css';

type Variant = 'primary' | 'default' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'default', size = 'md', icon, iconRight, block, children, className, ...rest
}: Props) {
  const cls = [s.btn, s[variant], s[size], block && s.block, className].filter(Boolean).join(' ');
  const iconSize = size === 'lg' ? 17 : 15;
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

interface IconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: IconName;
  variant?: Variant;
  size?: Size;
  /** 스크린리더용 설명 — 아이콘만 있는 버튼에는 필수 */
  label: string;
}

export function IconButton({ name, variant = 'quiet', size = 'md', label, className, ...rest }: IconProps) {
  const cls = [s.btn, s[variant], s[size], s.icon, className].filter(Boolean).join(' ');
  return (
    <button className={cls} aria-label={label} title={label} {...rest}>
      <Icon name={name} size={size === 'lg' ? 18 : 15} />
    </button>
  );
}
