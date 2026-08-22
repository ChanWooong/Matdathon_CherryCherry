import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects as projectsApi } from '../../api';
import { Header, Page, PageHead } from '../../components/layout';
import { AddProjectNode, ProjectNode } from '../../components/domain/ProjectNode';
import { Banner, Button, Modal, TextArea, TextInput, useToast } from '../../components/ui';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../auth/AuthContext';
import s from './HomePage.module.css';

export function HomePage() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => projectsApi.listProjects(), []);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => { setOpen(false); setName(''); setDesc(''); };

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const created = await projectsApi.createProject({ name, description: desc });
      close();
      toast(`프로젝트 "${created.name}" 를 만들었습니다`, 'success');
      nav(`/p/${created.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '만들지 못했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }

  const list = data ?? [];

  return (
    <>
      <Header />
      <Page>
        <PageHead
          eyebrow="프로젝트"
          title={user ? `${user.name || user.login} 님의 작업실` : '작업실'}
          desc="관련 있는 레포지토리와 회의록을 한 곳에 모아 둡니다. 폴더를 눌러 들어가세요."
          actions={<Button variant="primary" icon="plus" onClick={() => setOpen(true)}>새 프로젝트</Button>}
        />

        {error && (
          <Banner tone="error" title="프로젝트를 불러오지 못했습니다"
            actions={<Button size="sm" onClick={reload}>다시 시도</Button>}>
            {error}
          </Banner>
        )}

        {loading ? (
          <div className={s.loading}>
            {[0, 1, 2, 3].map((i) => <div key={i} className={s.ghost} />)}
          </div>
        ) : (
          <div className={s.grid}>
            {list.map((p) => (
              <ProjectNode key={p.id} project={p} onOpen={(id) => nav(`/p/${id}`)} />
            ))}
            <AddProjectNode onClick={() => setOpen(true)} />
          </div>
        )}

        {!loading && list.length === 0 && (
          <p className={s.hint}>
            아직 프로젝트가 없습니다. <b>새 프로젝트</b>를 만들고 레포지토리와 회의록을 담아 보세요.
          </p>
        )}
      </Page>

      <Modal
        open={open}
        onClose={close}
        title="새 프로젝트"
        sub="나중에 레포지토리와 회의록을 추가할 수 있습니다"
        footer={
          <>
            <Button onClick={close}>취소</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || saving}>
              {saving ? '만드는 중…' : '만들기'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <TextInput
            label="이름"
            placeholder="예) 체리체리 해커톤"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
          <TextArea
            label="설명"
            hint="선택 사항입니다."
            placeholder="이 프로젝트에서 무엇을 하나요?"
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
