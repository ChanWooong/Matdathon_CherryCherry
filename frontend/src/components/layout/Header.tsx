import { Link } from 'react-router-dom';
import { HoverMenu, Icon, MenuItem, MenuSep } from '../ui';
import { useAuth } from '../../features/auth/AuthContext';
import { initials } from '../../lib/format';
import { IS_DEMO_AUTH, IS_MOCK } from '../../api';
import s from './Header.module.css';

export interface Crumb {
  label: string;
  to?: string;
}

export function Header({ crumbs = [] }: { crumbs?: Crumb[] }) {
  const { user, signOut } = useAuth();

  return (
    <header className={s.header}>
      <Link to="/" className={s.brand}>
        <span className={s.mark}>Meet<em>·</em>to<em>·</em>Issue</span>
      </Link>
      <span className={s.tagline}>회의록에서 이슈까지</span>

      {crumbs.length > 0 && (
        <nav className={s.crumbs} aria-label="위치">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
              <Icon name="chevron-right" size={14} />
              {c.to ? (
                <Link to={c.to} className={s.crumb}>{c.label}</Link>
              ) : (
                <span className={[s.crumb, s.current].join(' ')}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className={s.right}>
        {(IS_MOCK || IS_DEMO_AUTH) && (
          <span
            className={s.mode}
            title={IS_MOCK ? '백엔드 없이 목 데이터로 동작 중' : '인증 요청 없는 로컬 데모 로그인'}
          >
            {IS_MOCK ? 'mock' : 'demo login'}
          </span>
        )}
        {user && (
          <HoverMenu
            placement="bottomRight"
            trigger={() => (
              <button className={s.user}>
                {user.avatarUrl
                  ? <img className={s.avatar} src={user.avatarUrl} alt="" />
                  : <span className={s.avatar}>{initials(user.name || user.login)}</span>}
                <span className={s.userName}>{user.login}</span>
                <Icon name="chevron-down" size={13} />
              </button>
            )}
          >
            <MenuItem icon="folder" desc={user.name}>{user.login}</MenuItem>
            <MenuSep />
            <MenuItem icon="arrow-left" onClick={() => void signOut()}>로그아웃</MenuItem>
          </HoverMenu>
        )}
      </div>
    </header>
  );
}
