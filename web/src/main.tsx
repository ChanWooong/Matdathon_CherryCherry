import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.tsx';

// StrictMode의 이중 마운트는 분석 스트림을 두 번 시작시키므로 사용하지 않는다.
createRoot(document.getElementById('root')!).render(<App />);
