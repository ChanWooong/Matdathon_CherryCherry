import { useLocation, useNavigate } from 'react-router-dom';
import { API_MODE } from '../api';
import { useStore } from '../store';

export function Header() {
  const nav = useNavigate();
  const loc = useLocation();
  const { repo, setRepo } = useStore();

  const tab = loc.pathname.startsWith('/pulls') ? 'pr' : 'issues';
  const inFlow = /^\/(new|analyze|review|result)/.test(loc.pathname);

  return (
    <header className="app-header">
      <div className="brand" onClick={() => nav('/')}>
        <span aria-hidden>🤖</span>
        <span>MeetToIssue</span>
        <small className="hide-sm">회의록 → 이슈</small>
      </div>

      {repo && !inFlow && (
        <>
          <span className="muted hide-sm">/</span>
          <button
            className="btn sm ghost"
            onClick={() => { setRepo(null); nav('/'); }}
            title="다른 리포 선택"
          >
            📦 {repo.fullName} ▾
          </button>
          <div className="tabs" style={{ marginLeft: 8 }}>
            <button className={tab === 'issues' ? 'on' : ''} onClick={() => nav('/issues')}>이슈</button>
            <button className={tab === 'pr' ? 'on' : ''} onClick={() => nav('/pulls')}>PR</button>
          </div>
        </>
      )}

      <div className="spacer" />
      {API_MODE === 'mock' && (
        <span className="badge warn hide-sm" title="백엔드 없이 브라우저에서 에이전트를 시뮬레이션합니다">
          MOCK 모드
        </span>
      )}
      <span className="muted xs">@octocat</span>
    </header>
  );
}
