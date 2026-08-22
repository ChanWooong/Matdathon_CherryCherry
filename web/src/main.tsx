import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/base.css';

// StrictMode 를 쓰지 않는다. 이중 마운트가 에이전트 스트림을 두 번 시작시킨다.
createRoot(document.getElementById('root')!).render(<App />);
