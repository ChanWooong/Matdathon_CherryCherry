import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { meetings as meetingsApi, projects as projectsApi, repos as reposApi } from '../../api';
import { Header, Page, PageHead } from '../../components/layout';
import {
  Banner, Button, EmptyState, HoverMenu, Icon, IconButton, List, ListRow,
  MenuItem, MenuLabel, SkeletonRows, Tabs, Tag, useToast,
} from '../../components/ui';
import { AddReposModal } from '../repos/AddReposModal';
import { useAsync } from '../../lib/useAsync';
import { preview, relativeTime } from '../../lib/format';
import s from './ProjectPage.module.css';

type TabId = 'repos' | 'meetings';

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'repos';

  const project = useAsync(() => projectsApi.getProject(projectId), [projectId]);
  const repoList = useAsync(() => reposApi.listProjectRepos(projectId), [projectId]);
  const meetingList = useAsync(() => meetingsApi.listMeetings(projectId), [projectId]);

  const [addOpen, setAddOpen] = useState(false);

  const repos = repoList.data ?? [];
  const notes = meetingList.data ?? [];

  function setTab(id: TabId) {
    setParams(id === 'repos' ? {} : { tab: id }, { replace: true });
  }

  function refreshAll() {
    repoList.reload();
    project.reload();
  }

  async function removeRepo(id: number, fullName: string) {
    if (!confirm(`${fullName} 를 이 프로젝트에서 뺄까요?\n(GitHub 에는 영향이 없습니다)`)) return;
    await reposApi.removeRepo(projectId, id);
    toast(`${fullName} 를 제외했습니다`);
    refreshAll();
  }

  async function removeMeeting(id: string, title: string) {
    if (!confirm(`회의록 "${title}" 를 삭제할까요?`)) return;
    await meetingsApi.deleteMeeting(projectId, id);
    toast('회의록을 삭제했습니다');
    meetingList.reload();
    project.reload();
  }

  const renderAddMenu = () => (
    <HoverMenu
      placement="bottomRight"
      trigger={(open) => (
        <Button variant="primary" icon="plus" iconRight={open ? 'chevron-down' : undefined}>
          추가
        </Button>
      )}
    >
      <MenuLabel>이 프로젝트에 추가</MenuLabel>
      <MenuItem icon="repo" desc="여러 개를 한 번에 고를 수 있어요" onClick={() => setAddOpen(true)}>
        레포지토리 추가
      </MenuItem>
      <MenuItem icon="note" desc="붙여넣으면 회의록 탭에 보관됩니다" onClick={() => nav(`/p/${projectId}/meetings/new`)}>
        회의록 추가
      </MenuItem>
    </HoverMenu>
  );

  return (
    <>
      <Header crumbs={[{ label: project.data?.name ?? '프로젝트' }]} />
      <Page>
        <PageHead
          eyebrow={<><Icon name="folder-open" size={13} /> 프로젝트</>}
          title={project.data?.name ?? '\u00a0'}
          desc={project.data?.description}
          actions={renderAddMenu()}
        />

        {project.error && <Banner tone="error">{project.error}</Banner>}

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'repos', label: '레포지토리', icon: 'repo', count: repos.length },
            { id: 'meetings', label: '회의록', icon: 'note', count: notes.length },
          ]}
        />

        <div style={{ marginTop: 'var(--sp-4)' }}>
          {tab === 'repos' ? (
            repoList.loading ? (
              <SkeletonRows rows={3} />
            ) : repos.length === 0 ? (
              <EmptyState
                icon="repo"
                title="등록된 레포지토리가 없습니다"
                desc="이슈와 PR 을 관리할 레포지토리를 골라 프로젝트에 담아 주세요."
                action={<Button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>레포지토리 추가</Button>}
              />
            ) : (
              <List>
                {repos.map((r) => (
                  <ListRow
                    key={r.id}
                    onClick={() => nav(`/p/${projectId}/repos/${r.id}`)}
                    lead={<Icon name="repo" size={17} />}
                    title={
                      <span className={s.repoRow}>
                        <span className={s.owner}>{r.owner}/</span>
                        <span className={s.repoName}>{r.name}</span>
                        {r.private && <Tag tone="sunk">private</Tag>}
                      </span>
                    }
                    meta={
                      <>
                        {r.description && <span>{r.description}</span>}
                        {r.language && <span className={s.lang}><i className={s.langDot} />{r.language}</span>}
                        <span>{relativeTime(r.updatedAt)} 업데이트</span>
                      </>
                    }
                    trail={
                      <>
                        <span className={s.counts}>
                          <span className={s.count}><Icon name="issue" size={13} /> <b>{r.openIssues}</b></span>
                          <span className={s.count}><Icon name="pull-request" size={13} /> <b>{r.openPulls}</b></span>
                        </span>
                        <IconButton
                          name="trash"
                          label="프로젝트에서 제외"
                          onClick={(e) => { e.stopPropagation(); void removeRepo(r.id, r.fullName); }}
                        />
                        <Icon name="chevron-right" size={15} />
                      </>
                    }
                  />
                ))}
              </List>
            )
          ) : meetingList.loading ? (
            <SkeletonRows rows={3} />
          ) : notes.length === 0 ? (
            <EmptyState
              icon="note"
              title="보관된 회의록이 없습니다"
              desc="회의록을 붙여넣어 두면 이슈를 만들 때 골라 쓸 수 있습니다."
              action={<Button variant="primary" icon="plus" onClick={() => nav(`/p/${projectId}/meetings/new`)}>회의록 추가</Button>}
            />
          ) : (
            <List>
              {notes.map((m) => (
                <ListRow
                  key={m.id}
                  onClick={() => nav(`/p/${projectId}/meetings/${m.id}`)}
                  lead={<Icon name="note" size={17} />}
                  title={
                    <span className={s.meetingTitle}>
                      {m.title}
                      {m.issueCount > 0 && <Tag tone="moss">이슈 {m.issueCount}</Tag>}
                    </span>
                  }
                  meta={<span className={s.preview}>{preview(m.content, 110)}</span>}
                  trail={
                    <>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-500)' }}>
                        {relativeTime(m.createdAt)}
                      </span>
                      <IconButton
                        name="trash"
                        label="회의록 삭제"
                        onClick={(e) => { e.stopPropagation(); void removeMeeting(m.id, m.title); }}
                      />
                      <Icon name="chevron-right" size={15} />
                    </>
                  }
                />
              ))}
            </List>
          )}
        </div>

        {/* 어느 탭에서도 레포지토리나 회의록을 바로 추가할 수 있는 하단 진입점 */}
        <div className={s.footBar}>
          <Icon name="quote" size={16} />
          <span className={s.footText}>
            프로젝트에 <b>레포지토리를 연결</b>하거나 방금 끝난 <b>회의록을 보관</b>하세요.
          </span>
          {renderAddMenu()}
        </div>
      </Page>

      <AddReposModal
        open={addOpen}
        projectId={projectId}
        existing={repos.map((r) => r.id)}
        onClose={() => setAddOpen(false)}
        onAdded={refreshAll}
      />
    </>
  );
}
