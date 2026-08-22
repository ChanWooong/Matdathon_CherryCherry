import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  agents as agentsApi, meetings as meetingsApi,
  projects as projectsApi, repos as reposApi,
} from '../../api';
import { BackLink, Header, Page, PageHead } from '../../components/layout';
import {
  Banner, Button, Card, CardBody, CardHead, EmptyState, Icon, List, ListRow,
  SkeletonRows, Tag, useToast,
} from '../../components/ui';
import { AgentRail } from '../../components/domain/AgentRail';
import { DraftCard } from '../../components/domain/DraftCard';
import { useAsync } from '../../lib/useAsync';
import { preview, relativeTime } from '../../lib/format';
import type { AgentState, Decision, Draft } from '../../types';
import s from './IssueCreatePage.module.css';

type Stage = 'pick' | 'run' | 'review';

const INITIAL_AGENTS: AgentState[] = [
  { id: 'extractor', name: '추출 에이전트', icon: 'quote', status: 'idle', note: '회의록에서 결정사항과 할 일을 골라냅니다' },
  { id: 'composer', name: '정리 에이전트', icon: 'layers', status: 'idle', note: '이슈 형식에 맞게 초안을 씁니다' },
  { id: 'reviewer', name: '검수 에이전트', icon: 'check-circle', status: 'idle', note: '빠진 정보와 중복을 확인합니다' },
];

export function IssueCreatePage() {
  const { projectId = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();

  const project = useAsync(() => projectsApi.getProject(projectId), [projectId]);
  const repoList = useAsync(() => reposApi.listProjectRepos(projectId), [projectId]);
  const meetingList = useAsync(() => meetingsApi.listMeetings(projectId), [projectId]);

  const [repoId, setRepoId] = useState<number | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const repos = useMemo(() => repoList.data ?? [], [repoList.data]);
  const notes = useMemo(() => meetingList.data ?? [], [meetingList.data]);

  // 쿼리로 넘어온 값을 기본 선택으로 쓴다
  useEffect(() => {
    const q = Number(params.get('repo'));
    if (q && repos.some((r) => r.id === q)) setRepoId(q);
    else if (repos.length === 1) setRepoId(repos[0].id);
  }, [params, repos]);

  useEffect(() => {
    const q = params.get('meeting');
    if (q && notes.some((m) => m.id === q)) setMeetingId(q);
  }, [params, notes]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const repo = repos.find((r) => r.id === repoId);
  const meeting = notes.find((m) => m.id === meetingId);
  const canRun = Boolean(repo && meeting);

  function setAgent(id: AgentState['id'], patch: Partial<AgentState>) {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function run() {
    if (!canRun || !meeting) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStage('run');
    setAgents(INITIAL_AGENTS.map((a) => ({ ...a, status: 'idle', note: a.note, ms: undefined, progress: undefined })));
    setDecisions([]);
    setDrafts([]);
    setRunError(null);

    try {
      await agentsApi.runIssuePipeline(
        { meetingText: meeting.content, meetingId: meeting.id, repoId: repo!.id },
        (e) => {
          switch (e.type) {
            case 'agent_start':
              setAgent(e.agent, { status: 'running', note: '', progress: undefined });
              break;
            case 'token':
              setAgents((prev) => prev.map((a) => (a.id === e.agent ? { ...a, note: a.note + e.text } : a)));
              break;
            case 'progress':
              setAgent(e.agent, { note: e.note, progress: e.progress });
              break;
            case 'decisions':
              setDecisions(e.items);
              break;
            case 'drafts':
              setDrafts(e.items);
              break;
            case 'review':
              setDrafts((prev) => prev.map((d) => ({
                ...d,
                warnings: e.items.find((r) => r.draftId === d.id)?.warnings ?? [],
              })));
              break;
            case 'agent_done':
              setAgent(e.agent, { status: 'done', note: e.note, ms: e.ms, progress: undefined });
              break;
            case 'error':
              setAgent(e.agent, { status: 'error', note: e.message });
              setRunError(e.message);
              break;
            case 'done':
              setStage((cur) => (cur === 'run' ? 'review' : cur));
              break;
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setRunError(e instanceof Error ? e.message : '분석에 실패했습니다.');
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStage('pick');
  }

  const picked = drafts.filter((d) => d.selected);

  const issueDraftText = useMemo(() => {
    if (!repo || picked.length === 0) return '';
    return picked
      .map((draft, index) => {
        const labels = draft.labels.length > 0 ? draft.labels.map((label) => `\`${label}\``).join(', ') : '-';
        const assignee = draft.assignee ?? '-';
        const due = draft.due ?? '-';
        const criteria = draft.ac
          .map((criterion, criterionIndex) => `${criterionIndex + 1}. ${criterion.text}`)
          .join('\n');
        return [
          `### ${index + 1}. ${draft.title}`,
          `- Repository: ${repo.fullName}`,
          `- Labels: ${labels}`,
          `- Assignee: ${assignee}`,
          `- Due: ${due}`,
          '',
          '#### Body',
          draft.body.trim() || '-',
          '',
          '#### Acceptance Criteria',
          criteria || '-',
          '',
          '#### Evidence',
          draft.evidence.trim() || '-',
        ].join('\n');
      })
      .join('\n\n---\n\n');
  }, [picked, repo]);

  async function copyIssueText() {
    if (!issueDraftText || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(issueDraftText);
      toast(`초안 ${picked.length}건을 클립보드에 복사했습니다`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '클립보드 복사에 실패했습니다', 'error');
    } finally {
      setCopying(false);
    }
  }

  const stepIndex = stage === 'pick' ? 0 : stage === 'run' ? 1 : 2;
  const STEPS = ['회의록 고르기', '읽고 정리하기', '확인하고 복사'];

  return (
    <>
      <Header
        crumbs={[
          { label: project.data?.name ?? '프로젝트', to: `/p/${projectId}` },
          ...(repo ? [{ label: repo.name, to: `/p/${projectId}/repos/${repo.id}` }] : []),
          { label: '이슈 만들기' },
        ]}
      />
      <Page>
        <BackLink to={repo ? `/p/${projectId}/repos/${repo.id}` : `/p/${projectId}`}>
          {repo ? repo.fullName : project.data?.name ?? '프로젝트'}
        </BackLink>
        <PageHead
          eyebrow={<><Icon name="issue" size={13} /> 이슈 만들기</>}
          title="회의록에서 이슈 만들기"
          desc="프로젝트 회의록으로 이슈 초안을 만든 뒤, 텍스트를 복사해 수동으로 등록합니다."
        />

        <div className={s.steps}>
          {STEPS.map((label, i) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className={s.sep}>—</span>}
              <span className={[s.step, i === stepIndex && s.stepOn, i < stepIndex && s.stepDone].filter(Boolean).join(' ')}>
                <span className={s.stepNum}>{i < stepIndex ? '✓' : i + 1}</span>
                {label}
              </span>
            </span>
          ))}
        </div>

        {repoList.error && <Banner tone="error">{repoList.error}</Banner>}

        {/* ---------------------------- 1. 고르기 ---------------------------- */}
        {stage === 'pick' && (
          <div className={s.split}>
            <div>
              <div className={s.pickHead}>
                <span className={s.pickTitle}>회의록 고르기</span>
                <Button size="sm" icon="plus" onClick={() => nav(`/p/${projectId}/meetings/new`)}>
                  회의록 추가
                </Button>
              </div>

              {meetingList.loading ? (
                <SkeletonRows rows={3} />
              ) : notes.length === 0 ? (
                <EmptyState
                  icon="note"
                  title="보관된 회의록이 없습니다"
                  desc="회의록을 먼저 붙여넣어야 이슈를 만들 수 있습니다."
                  action={<Button variant="primary" icon="plus" onClick={() => nav(`/p/${projectId}/meetings/new`)}>회의록 추가</Button>}
                />
              ) : (
                <List>
                  {notes.map((m) => (
                    <ListRow
                      key={m.id}
                      selected={m.id === meetingId}
                      onClick={() => setMeetingId(m.id)}
                      lead={<Icon name={m.id === meetingId ? 'check-circle' : 'note'} size={17} />}
                      title={m.title}
                      meta={
                        <>
                          <span>{relativeTime(m.createdAt)}</span>
                          {m.issueCount > 0 && <Tag tone="moss">이슈 {m.issueCount}건 생성됨</Tag>}
                          <span>{preview(m.content, 70)}</span>
                        </>
                      }
                    />
                  ))}
                </List>
              )}
            </div>

            <aside className={s.aside}>
              <Card>
                <CardHead title="어느 레포지토리에" />
                <CardBody>
                  {repos.length === 0 ? (
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-500)' }}>
                      등록된 레포지토리가 없습니다.
                    </span>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {repos.map((r) => (
                        <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                          <input
                            type="radio"
                            name="repo"
                            checked={r.id === repoId}
                            onChange={() => setRepoId(r.id)}
                            style={{ accentColor: 'var(--clay)' }}
                          />
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            <span style={{ color: 'var(--ink-400)' }}>{r.owner}/</span>{r.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>

              {meeting && (
                <Card>
                  <CardHead title="미리보기" sub={`${meeting.content.split('\n').length}줄`} />
                  <CardBody>
                    <div className={s.notePreview}>{meeting.content}</div>
                  </CardBody>
                </Card>
              )}

              <Button variant="primary" size="lg" block iconRight="arrow-right" disabled={!canRun} onClick={() => void run()}>
                회의록 읽어내기
              </Button>
              {!canRun && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-500)', textAlign: 'center' }}>
                  회의록과 레포지토리를 하나씩 골라 주세요.
                </span>
              )}
            </aside>
          </div>
        )}

        {/* ------------------------ 2·3. 분석 / 검토 ------------------------- */}
        {(stage === 'run' || stage === 'review') && (
          <div className={s.split}>
            <div>
              {drafts.length === 0 ? (
                <EmptyState
                  flat
                  icon="layers"
                  title="회의록을 읽는 중입니다"
                  desc="할 일과 결정사항을 가려내고 이슈 초안을 씁니다. 잠시만 기다려 주세요."
                />
              ) : (
                <div className={s.drafts}>
                  {drafts.map((d) => (
                    <DraftCard
                      key={d.id}
                      draft={d}
                      onChange={(next) => setDrafts((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                    />
                  ))}
                </div>
              )}

              {stage === 'review' && drafts.length > 0 && (
                <div className={s.actions}>
                  <span className={s.actionsNote}>
                    {picked.length}건을 <b style={{ fontFamily: 'var(--font-mono)' }}>{repo?.fullName}</b> 용 초안으로 복사합니다.
                    GitHub 업로드는 하지 않습니다.
                  </span>
                  <Button onClick={() => setStage('pick')}>다시 고르기</Button>
                  <Button variant="primary" icon="copy" disabled={picked.length === 0 || copying} onClick={() => void copyIssueText()}>
                    {copying ? '복사 중…' : `${picked.length}건 이슈 글 복사`}
                  </Button>
                </div>
              )}
              {stage === 'review' && picked.length > 0 && (
                <div style={{ marginTop: 'var(--sp-4)' }}>
                  <Card>
                    <CardHead title="복사용 이슈 텍스트" sub="그대로 복사해서 GitHub 이슈 본문에 붙여넣으세요" />
                    <CardBody>
                      <textarea className={s.copyPreview} value={issueDraftText} readOnly />
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>

            <aside className={s.aside}>
              <AgentRail agents={agents} />
              {stage === 'run' && (
                <Button icon="stop" block onClick={stop}>중단</Button>
              )}
              {runError && <Banner tone="error" title="분석을 마치지 못했습니다">{runError}</Banner>}

              {decisions.length > 0 && (
                <Card>
                  <CardHead title="결정사항" sub={`${decisions.length}건`} />
                  <CardBody>
                    <div className={s.decisions}>
                      {decisions.map((d) => (
                        <div key={d.text} className={s.decision}>
                          <Icon name="check" size={14} />
                          <span>{d.text}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}
            </aside>
          </div>
        )}
      </Page>
    </>
  );
}
