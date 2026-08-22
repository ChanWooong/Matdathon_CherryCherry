import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { ToastProvider } from './components/ui';
import { RequireAuth } from './routes/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { HomePage } from './features/projects/HomePage';
import { ProjectPage } from './features/projects/ProjectPage';
import { MeetingEditorPage } from './features/meetings/MeetingEditorPage';
import { RepoPage } from './features/repos/RepoPage';
import { IssueCreatePage } from './features/issues/IssueCreatePage';
import { PullPage } from './features/pulls/PullPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/p/:projectId" element={<RequireAuth><ProjectPage /></RequireAuth>} />
            <Route path="/p/:projectId/meetings/new" element={<RequireAuth><MeetingEditorPage /></RequireAuth>} />
            <Route path="/p/:projectId/meetings/:meetingId" element={<RequireAuth><MeetingEditorPage /></RequireAuth>} />
            <Route path="/p/:projectId/repos/:repoId" element={<RequireAuth><RepoPage /></RequireAuth>} />
            <Route path="/p/:projectId/repos/:repoId/pulls/:number" element={<RequireAuth><PullPage /></RequireAuth>} />
            <Route path="/p/:projectId/issues/new" element={<RequireAuth><IssueCreatePage /></RequireAuth>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
