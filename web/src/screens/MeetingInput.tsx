import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_MEETING } from '../api/fixtures';
import { emptySession, useStore } from '../store';
import { Banner, Stepper } from '../components/ui';

const MIN = 30;
const MAX = 20000;

export default function MeetingInput() {
  const nav = useNavigate();
  const { repo, setSession } = useStore();
  const [text, setText] = useState('');
  const [fileErr, setFileErr] = useState<string | null>(null);

  if (!repo) return null;

  const len = text.trim().length;
  const tooShort = len > 0 && len < MIN;
  const tooLong = len > MAX;
  const canStart = len >= MIN && !tooLong;

  const start = () => {
    setSession(emptySession(repo.fullName, text.trim()));
    nav('/analyze');
  };

  const onFile = async (f: File | undefined) => {
    setFileErr(null);
    if (!f) return;
    if (!/\.(txt|md|markdown)$/i.test(f.name)) {
      setFileErr('.txt 또는 .md 파일만 지원합니다');
      return;
    }
    setText(await f.text());
  };

  return (
    <div className="page">
      <div className="between" style={{ marginBottom: 16 }}>
        <button className="btn ghost sm" onClick={() => nav('/issues')}>← 이슈 목록으로</button>
        <Stepper current={1} />
      </div>

      <h2 style={{ margin: '0 0 4px', fontSize: 19 }}>회의록을 붙여넣으세요</h2>
      <p className="muted xs" style={{ margin: '0 0 12px' }}>
        형식은 자유입니다. 불릿, 대화록, 메모 모두 인식합니다.
      </p>

      <textarea
        className="field"
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'예)\n8/22 스프린트 회의\n참석: 김, 이, 박\n- 로그인 토큰 만료 버그 → 김이 이번 주까지\n- 검색 API 페이지네이션 필요 (이)'}
        aria-label="회의록 원문"
        autoFocus
      />

      <div className="between wrap" style={{ margin: '8px 0 16px' }}>
        <div className="row wrap xs muted">
          <label className="btn sm" style={{ cursor: 'pointer' }}>
            📎 파일 첨부
            <input type="file" accept=".txt,.md,.markdown" hidden
              onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button className="btn sm ghost" onClick={() => setText(DEMO_MEETING)}>
            데모 회의록 채우기
          </button>
          <span>🔒 원문은 분석 후 저장되지 않습니다</span>
        </div>
        <span className={`xs ${tooLong ? '' : 'muted'}`} style={tooLong ? { color: 'var(--danger)' } : undefined}>
          {len.toLocaleString()}자
        </span>
      </div>

      {fileErr && <Banner kind="err">{fileErr}</Banner>}
      {tooShort && <Banner kind="warn">회의록이 너무 짧습니다. {MIN}자 이상 입력하세요.</Banner>}
      {tooLong && <Banner kind="err">{MAX.toLocaleString()}자를 초과했습니다. 회의록을 나눠서 분석하세요.</Banner>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => nav('/issues')}>취소</button>
        <button className="btn primary" disabled={!canStart} onClick={start}>✨ 분석 시작</button>
      </div>
    </div>
  );
}
