import { useMemo, useState } from 'react';
import { repos as reposApi } from '../../api';
import { Button, Checkbox, Modal, SearchInput, SkeletonRows, Tag, useToast } from '../../components/ui';
import { useAsync } from '../../lib/useAsync';
import { relativeTime } from '../../lib/format';
import s from './AddReposModal.module.css';

interface Props {
  open: boolean;
  projectId: string;
  /** 이미 등록된 레포 id */
  existing: number[];
  onClose: () => void;
  onAdded: () => void;
}

/** 레포지토리를 여러 개 골라 프로젝트에 한 번에 등록한다. */
export function AddReposModal({ open, projectId, existing, onClose, onAdded }: Props) {
  const toast = useToast();
  const { data, loading } = useAsync(() => (open ? reposApi.listAvailableRepos() : Promise.resolve([])), [open]);
  const [picked, setPicked] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const all = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return all;
    return all.filter((r) =>
      r.fullName.toLowerCase().includes(key) || (r.description ?? '').toLowerCase().includes(key));
  }, [all, q]);

  const selectable = filtered.filter((r) => !existing.includes(r.id));
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.includes(r.id));

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setPicked(allPicked ? [] : selectable.map((r) => r.id));
  }

  function close() {
    setPicked([]);
    setQ('');
    onClose();
  }

  async function submit() {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    try {
      await reposApi.addRepos(projectId, picked);
      toast(`레포지토리 ${picked.length}개를 추가했습니다`, 'success');
      close();
      onAdded();
    } catch (e) {
      toast(e instanceof Error ? e.message : '추가하지 못했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="레포지토리 추가"
      sub="여러 개를 한 번에 고를 수 있습니다"
      footerNote={picked.length > 0 ? `${picked.length}개 선택됨` : '선택된 항목이 없습니다'}
      footer={
        <>
          <Button onClick={close}>취소</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={picked.length === 0 || saving}>
            {saving ? '추가하는 중…' : `${picked.length || ''} 추가하기`.trim()}
          </Button>
        </>
      }
    >
      <div className={s.tools}>
        <SearchInput placeholder="레포지토리 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" onClick={toggleAll} disabled={selectable.length === 0}>
          {allPicked ? '전체 해제' : '전체 선택'}
        </Button>
      </div>

      <div className={s.scroll}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : filtered.length === 0 ? (
          <div className={s.none}>검색 결과가 없습니다.</div>
        ) : (
          filtered.map((r) => {
            const already = existing.includes(r.id);
            const on = picked.includes(r.id);
            return (
              <label
                key={r.id}
                className={[s.row, on && s.on, already && s.disabled].filter(Boolean).join(' ')}
              >
                <Checkbox checked={already || on} disabled={already} onChange={() => toggle(r.id)} />
                <span className={s.main}>
                  <span className={s.name}>
                    <span className={s.owner}>{r.owner}/</span>{r.name}
                    {r.private && <Tag tone="sunk">private</Tag>}
                    {already && <Tag tone="moss">등록됨</Tag>}
                  </span>
                  {r.description && <span className={s.desc}>{r.description}</span>}
                  <span className={s.meta}>
                    {r.language && <span className={s.lang}><i className={s.langDot} />{r.language}</span>}
                    <span>이슈 {r.openIssues}</span>
                    <span>PR {r.openPulls}</span>
                    <span>{relativeTime(r.updatedAt)} 업데이트</span>
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </Modal>
  );
}
