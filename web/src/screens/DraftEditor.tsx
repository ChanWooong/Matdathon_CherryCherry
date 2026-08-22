import { useState } from 'react';
import { Modal } from '../components/ui';
import type { Draft } from '../types';

export default function DraftEditor({
  draft, onSave, onClose,
}: { draft: Draft; onSave(d: Draft): void; onClose(): void }) {
  const [d, setD] = useState<Draft>({ ...draft, ac: draft.ac.map((a) => ({ ...a })) });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setAc = (i: number, text: string) =>
    setD((p) => ({ ...p, ac: p.ac.map((a, idx) => (idx === i ? { ...a, text } : a)) }));

  return (
    <Modal
      title="이슈 초안 수정"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn primary"
            disabled={!d.title.trim()}
            onClick={() => onSave({ ...d, ac: d.ac.filter((a) => a.text.trim()) })}
          >
            저장
          </button>
        </>
      }
    >
      <div>
        <label className="lbl" htmlFor="t">제목</label>
        <input id="t" className="field" value={d.title} onChange={(e) => set('title', e.target.value)} autoFocus />
      </div>

      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <label className="lbl" htmlFor="l">라벨 (쉼표 구분)</label>
          <input id="l" className="field" value={d.labels.join(', ')}
            onChange={(e) => set('labels', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="lbl" htmlFor="a">담당자</label>
          <input id="a" className="field" placeholder="예: kim" value={d.assignee ?? ''}
            onChange={(e) => set('assignee', e.target.value.trim() || null)} />
        </div>
        <div style={{ width: 120 }}>
          <label className="lbl" htmlFor="due">기한</label>
          <input id="due" className="field" placeholder="8/24" value={d.due ?? ''}
            onChange={(e) => set('due', e.target.value.trim() || null)} />
        </div>
      </div>

      <div>
        <label className="lbl">완료 조건 (AC)</label>
        <div className="col">
          {d.ac.map((a, i) => (
            <div className="row" key={i}>
              <input className="field" value={a.text} onChange={(e) => setAc(i, e.target.value)} />
              <button className="btn sm ghost" title="삭제"
                onClick={() => setD((p) => ({ ...p, ac: p.ac.filter((_, x) => x !== i) }))}>🗑</button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setD((p) => ({ ...p, ac: [...p.ac, { text: '', done: false }] }))}>
            + 완료 조건 추가
          </button>
        </div>
        <div className="xs muted" style={{ marginTop: 6 }}>
          여기서 확정한 완료 조건은 이슈 본문에 저장되어, PR 리뷰의 요구사항 대조에 그대로 쓰입니다.
        </div>
      </div>

      <div>
        <label className="lbl" htmlFor="b">본문</label>
        <textarea id="b" className="field" rows={7} value={d.body} onChange={(e) => set('body', e.target.value)} />
      </div>
    </Modal>
  );
}
