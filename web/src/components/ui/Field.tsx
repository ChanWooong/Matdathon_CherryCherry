import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';
import s from './Field.module.css';

interface FieldShellProps {
  label?: string;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={[s.field, className].filter(Boolean).join(' ')}>
      {label && <label className={s.label} htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
}

export function TextInput({ label, hint, error, className, ...rest }: InputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        className={[s.control, error && s.invalid, className].filter(Boolean).join(' ')}
        {...rest}
      />
    </Field>
  );
}

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  /** 회의록처럼 긴 원문을 넣는 입력에는 모노 스타일을 쓴다 */
  paper?: boolean;
}

export function TextArea({ label, hint, error, paper, className, ...rest }: AreaProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea
        id={id}
        className={[s.control, paper && s.paper, error && s.invalid, className].filter(Boolean).join(' ')}
        {...rest}
      />
    </Field>
  );
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={[s.search, className].filter(Boolean).join(' ')}>
      <Icon name="search" size={15} />
      <input className={s.control} type="search" {...rest} />
    </div>
  );
}

interface CheckProps extends InputHTMLAttributes<HTMLInputElement> {
  children?: ReactNode;
}

export function Checkbox({ children, className, ...rest }: CheckProps) {
  return (
    <label className={[s.check, className].filter(Boolean).join(' ')}>
      <input type="checkbox" {...rest} />
      {children && <span className={s.checkBody}>{children}</span>}
    </label>
  );
}
