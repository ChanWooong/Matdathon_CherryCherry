import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Header';
import { emptySession, REPO_KEY, StoreContext, type AnalysisSession } from './store';
import type { Repo } from './types';
import RepoSelect from './screens/RepoSelect';
import IssueList from './screens/IssueList';
import MeetingInput from './screens/MeetingInput';
import Analyzing from './screens/Analyzing';
import Review from './screens/Review';
import Result from './screens/Result';
import PrList from './screens/PrList';
import PrReview from './screens/PrReview';

interface Toast { id: number; message: string; kind: 'ok' | 'err' }

/** 리포가 선택되지 않은 상태에서 내부 화면에 진입하면 리포 선택으로 돌려보낸다. */
function RequireRepo({ repo, children }: { repo: Repo | null; children: ReactNode }) {
  const loc = useLocation();
  if (!repo && loc.pathname !== '/') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell() {
  const nav = useNavigate();
  const [repo, setRepoState] = useState<Repo | null>(() => {
    try {
      const raw = localStorage.getItem(REPO_KEY);
      return raw ? (JSON.parse(raw) as Repo) : null;
    } catch { return null; }
  });
  const [session, setSession] = useState<AnalysisSession>(emptySession());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newIssueNumbers, setNewIssueNumbers] = useState<number[]>([]);

  const setRepo = useCallback((r: Repo | null) => {
    setRepoState(r);
    if (r) localStorage.setItem(REPO_KEY, JSON.stringify(r));
    else localStorage.removeItem(REPO_KEY);
  }, []);

  const toast = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    if (newIssueNumbers.length === 0) return;
    const t = setTimeout(() => setNewIssueNumbers([]), 6000);
    return () => clearTimeout(t);
  }, [newIssueNumbers]);

  const store = useMemo(
    () => ({ repo, setRepo, session, setSession, toast, newIssueNumbers, setNewIssueNumbers }),
    [repo, setRepo, session, toast, newIssueNumbers],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'n' && (e.metaKey || e.ctrlKey) && repo) { e.preventDefault(); nav('/new'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, repo]);

  return (
    <StoreContext.Provider value={store}>
      <Header />
      <RequireRepo repo={repo}>
        <Routes>
          <Route path="/" element={<RepoSelect />} />
          <Route path="/issues" element={<IssueList />} />
          <Route path="/new" element={<MeetingInput />} />
          <Route path="/analyze" element={<Analyzing />} />
          <Route path="/review" element={<Review />} />
          <Route path="/result" element={<Result />} />
          <Route path="/pulls" element={<PrList />} />
          <Route path="/pulls/:number" element={<PrReview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RequireRepo>

      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>{t.message}</div>)}
      </div>
    </StoreContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
