import { useState } from 'react';
import { Checkbox, Icon, Tag } from '../ui';
import type { Draft } from '../../types';
import s from './DraftCard.module.css';

interface Props {
  draft: Draft;
  onChange: (next: Draft) => void;
}

/** 승인 전 자유롭게 고칠 수 있는 이슈 초안 카드 */
export function DraftCard({ draft, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const patch = (p: Partial<Draft>) => onChange({ ...draft, ...p });

  return (
    <div className={[s.card, draft.selected ? s.on : s.off].join(' ')}>
      <div className={s.head}>
        <Checkbox
          checked={draft.selected}
          onChange={(e) => patch({ selected: e.target.checked })}
          aria-label="이 초안을 이슈로 만들기"
        />
        <div className={s.headMain}>
          <div className={s.titleRow}>
            {editTitle ? (
              <input
                className={s.titleInput}
                value={draft.title}
                autoFocus
                onChange={(e) => patch({ title: e.target.value })}
                onBlur={() => setEditTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditTitle(false); }}
              />
            ) : (
              <>
                <span className={s.title} onDoubleClick={() => setEditTitle(true)}>{draft.title}</span>
                <button className={s.toggle} onClick={() => setEditTitle(true)} aria-label="제목 수정">
                  <Icon name="pencil" size={13} />
                </button>
              </>
            )}
          </div>

          <div className={s.meta}>
            {draft.labels.map((l) => <Tag key={l} tone="clay">{l}</Tag>)}
            <span className={[s.chip, !draft.assignee && s.missing].filter(Boolean).join(' ')}>
              <Icon name="user" size={12} />{draft.assignee ?? '담당자 미정'}
            </span>
            <span className={[s.chip, !draft.due && s.missing].filter(Boolean).join(' ')}>
              <Icon name="calendar" size={12} />{draft.due ?? '기한 미정'}
            </span>
            <button className={s.toggle} onClick={() => setOpen((v) => !v)}>
              <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
              {open ? '접기' : '본문 보기'}
            </button>
          </div>
        </div>
      </div>

      {draft.warnings.length > 0 && (
        <div className={s.warn}>
          <ul>
            {draft.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {open && (
        <div className={s.detail}>
          <div className={s.fields}>
            <label className={s.section}>
              <span className={s.sectionLabel}>담당자</span>
              <input
                className={s.smallInput}
                placeholder="GitHub 아이디"
                value={draft.assignee ?? ''}
                onChange={(e) => patch({ assignee: e.target.value || null })}
              />
            </label>
            <label className={s.section}>
              <span className={s.sectionLabel}>기한</span>
              <input
                className={s.smallInput}
                placeholder="예) 8/23"
                value={draft.due ?? ''}
                onChange={(e) => patch({ due: e.target.value || null })}
              />
            </label>
          </div>

          <label className={s.section}>
            <span className={s.sectionLabel}>본문</span>
            <textarea
              className={s.body}
              value={draft.body}
              onChange={(e) => patch({ body: e.target.value })}
            />
          </label>

          <div className={s.section}>
            <span className={s.sectionLabel}>회의록 근거</span>
            <blockquote className={s.evidence}>{draft.evidence}</blockquote>
          </div>
        </div>
      )}
    </div>
  );
}
