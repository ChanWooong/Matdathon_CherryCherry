import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { issues as issuesApi, projects as projectsApi, pulls as pullsApi, repos as reposApi } from '../../api';
import { BackLink, Header, Page, PageHead } from '../../components/layout';
import {
  Banner, Button, EmptyState, Icon, List, ListRow, SearchInput,
  SkeletonRows, Tabs, Tag,
} from '../../components/ui';
import { useAsync } from '../../lib/useAsync';
import { relativeTime } from '../../lib/format';
import type { Issue, PullRequest } from '../../types';
import s from './RepoPage.module.css';

type TabId = 'issues' | 'pulls';

const LABEL_TONE: Record<string, 'clay' | 'moss' | 'ochre' | 'brick' | 'slate' | 'sunk'> = {
  bug: 'brick',
  'priority:high': 'ochre',
  enhancement: 'moss',
  feature: 'clay',
  documentation: 'slate',
  chore: 'sunk',
  test: 'slate',
  a11y: 'moss',
  infra: 'sunk',
};

export function RepoPage() {
  const { projectId = '', repoId = '' } = useParams();
  const id = Number(repoId);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  // 기본은 이슈 탭
  const tab = (params.get('tab') as TabId) || 'issues';
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const project = useAsync(() => projectsApi.getProject(projectId), [projectId]);
  const repo = useAsync(() => reposApi.getProjectRepo(projectId, id), [projectId, id]);
  const issueList = useAsync(() => issuesApi.listIssues(id, showClosed ? 'all' : 'open'), [id, showClosed]);
  const pullList = useAsync(() => pullsApi.listPulls(id), [id]);

  const key = q.trim().toLowerCase();
  const shownIssues = useMemo(
    () => (issueList.data ?? []).filter((i: Issue) => !key || i.title.toLowerCase().includes(key)),
    [issueList.data, key],
  );
  const shownPulls = useMemo(
    () => (pullList.data ?? []).filter((p: PullRequest) => !key || p.title.toLowerCase().includes(key)),
    [pullList.data, key],
  );

  function setTab(next: TabId) {
    setParams(next === 'issues' ? {} : { tab: next }, { replace: true });
    setQ('');
  }

  return (
    <>
      <Header
        crumbs={[
          { label: project.data?.name ?? '프로젝트', to: `/p/${projectId}` },
          { label: repo.data?.name ?? '레포지토리' },
        ]}
      />
      <Page>
        <BackLink to={`/p/${projectId}`}>{project.data?.name ?? '프로젝트'}</BackLink>
        <PageHead
          eyebrow={<><Icon name="repo" size={13} /> 레포지토리</>}
          title={
            repo.data ? (
              <span className={s.repoTitle}>
                <span className={s.owner}>{repo.data.owner}/</span>{repo.data.name}
                {repo.data.private && <Tag tone="sunk">private</Tag>}
              </span>
            ) : '\u00a0'
          }
          desc={repo.data?.description}
          actions={
            repo.data && (
              <Button
                icon="external"
                onClick={() => window.open(`https://github.com/${repo.data!.fullName}`, '_blank', 'noopener')}
              >
                GitHub
              </Button>
            )
          }
        />

        {repo.error && (
          <Banner tone="error" title="레포지토리를 열 수 없습니다"
            actions={<Button size="sm" onClick={() => nav(`/p/${projectId}`)}>프로젝트로</Button>}>
            {repo.error}
          </Banner>
        )}

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'issues', label: '이슈', icon: 'issue', count: shownIssues.length },
            { id: 'pulls', label: 'PR', icon: 'pull-request', count: shownPulls.length },
          ]}
        />

        <div className={s.filters}>
          <SearchInput
            placeholder={tab === 'issues' ? '이슈 제목 검색' : 'PR 제목 검색'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className={s.right}>
            {tab === 'issues' && (
              <>
                <Button size="sm" onClick={() => setShowClosed((v) => !v)}>
                  {showClosed ? '열린 이슈만' : '닫힌 이슈도 보기'}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => nav(`/p/${projectId}/issues/new?repo=${id}`)}
                >
                  Issue 생성하기
                </Button>
              </>
            )}
            {tab === 'pulls' && (
              <Button size="sm" onClick={() => pullList.reload()}>새로고침</Button>
            )}
          </span>
        </div>

        {tab === 'issues' ? (
          issueList.loading ? (
            <SkeletonRows rows={4} />
          ) : shownIssues.length === 0 ? (
            <EmptyState
              icon="issue"
              title={key ? '검색 결과가 없습니다' : '열린 이슈가 없습니다'}
              desc={key ? undefined : '보관한 회의록을 골라 이슈를 만들어 보세요.'}
              action={
                !key && (
                  <Button variant="primary" icon="plus" onClick={() => nav(`/p/${projectId}/issues/new?repo=${id}`)}>
                    Issue 생성하기
                  </Button>
                )
              }
            />
          ) : (
            <List>
              {shownIssues.map((i) => (
                <ListRow
                  key={i.number}
                  onClick={() => window.open(i.url, '_blank', 'noopener')}
                  lead={
                    <span className={i.state === 'open' ? s.open : s.closed}>
                      <Icon name={i.state === 'open' ? 'issue' : 'check-circle'} size={17} />
                    </span>
                  }
                  title={
                    <span className={s.issueTitle}>
                      {i.title}
                      {i.fromMeeting && <Tag tone="clay" dot>회의록</Tag>}
                    </span>
                  }
                  meta={
                    <>
                      <span className={s.num}>#{i.number}</span>
                      <span>{i.author} 가 {relativeTime(i.createdAt)} 열었습니다</span>
                      {i.assignee && <span>담당 {i.assignee}</span>}
                      <span className={s.labels}>
                        {i.labels.map((l) => <Tag key={l} tone={LABEL_TONE[l] ?? 'neutral'}>{l}</Tag>)}
                      </span>
                    </>
                  }
                  trail={<Icon name="external" size={14} />}
                />
              ))}
            </List>
          )
        ) : pullList.loading ? (
          <SkeletonRows rows={3} />
        ) : shownPulls.length === 0 ? (
          <EmptyState icon="pull-request" title={key ? '검색 결과가 없습니다' : '올라온 PR 이 없습니다'} />
        ) : (
          <List>
            {shownPulls.map((p) => (
              <ListRow
                key={p.number}
                onClick={() => nav(`/p/${projectId}/repos/${id}/pulls/${p.number}`)}
                lead={<span className={s[p.state]}><Icon name="pull-request" size={17} /></span>}
                title={
                  <span className={s.issueTitle}>
                    {p.title}
                    {p.draft && <Tag tone="sunk">draft</Tag>}
                    {p.state === 'merged' && <Tag tone="slate">merged</Tag>}
                  </span>
                }
                meta={
                  <>
                    <span className={s.num}>#{p.number}</span>
                    <span className={s.who}>{p.author} · {relativeTime(p.updatedAt)}</span>
                    <span className={s.diff}>
                      <span className={s.add}>+{p.additions}</span> <span className={s.del}>−{p.deletions}</span>
                    </span>
                    {p.linkedIssue && <Tag tone="clay">#{p.linkedIssue} 연결</Tag>}
                  </>
                }
                trail={<Icon name="chevron-right" size={15} />}
              />
            ))}
          </List>
        )}
      </Page>
    </>
  );
}
