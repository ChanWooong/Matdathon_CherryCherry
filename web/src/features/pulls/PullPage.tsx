import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { agents as agentsApi, projects as projectsApi, pulls as pullsApi, repos as reposApi } from '../../api';
import { BackLink, Header, Page, PageHead } from '../../components/layout';
import {
  Banner, Button, Card, CardBody, CardHead, Icon, Skeleton, Spinner, Tag, useToast,
} from '../../components/ui';
import { useAsync } from '../../lib/useAsync';
import { relativeTime } from '../../lib/format';
import type { ReviewFinding, ReviewSection } from '../../types';
import s from './PullPage.module.css';

const SECTIONS: ReviewSection[] = [
  { agent: 'requirements', name: '요구사항 대조', icon: 'check-circle', status: 'idle', findings: [], adopted: true },
  { agent: 'quality', name: '변경 품질', icon: 'layers', status: 'idle', findings: [], adopted: true },
  { agent: 'summary', name: '리뷰 요약', icon: 'quote', status: 'idle', findings: [], adopted: true },
];

const FINDING_ICON: Record<ReviewFinding['status'], 'check' | 'x' | 'alert' | 'dot'> = {
  pass: 'check', fail: 'x', warn: 'alert', info: 'dot',
};

/** PR 본문에 자주 쓰는 마크다운만 가볍게 그린다. */
function Body({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className={s.body}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
        if (line.startsWith('# ')) return <h2 key={i}>{line.slice(2)}</h2>;

        const check = line.match(/^- \[( |x)\] (.*)$/);
        if (check) {
          const done = check[1] === 'x';
          return (
            <div key={i} className={[s.check, done ? s.checked : s.unchecked].join(' ')}>
              <Icon name={done ? 'check-circle' : 'dot'} size={14} />
              <span>{inline(check[2])}</span>
            </div>
          );
        }
        if (/^[-*] /.test(line)) return <div key={i} className={s.bullet}>{inline(line.slice(2))}</div>;
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
        return <div key={i}>{inline(line)}</div>;
      })}
    </div>
  );
}

/** `code` 와 #123 만 처리한다. */
function inline(text: string) {
  const parts = text.split(/(`[^`]+`|#\d+)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    if (/^#\d+$/.test(p)) return <span key={i} className={s.issueRef}>{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

function toComment(sections: ReviewSection[]): string {
  const parts: string[] = ['## AI 리뷰 초안', ''];
  for (const sec of sections.filter((x) => x.adopted && x.findings.length > 0)) {
    parts.push(`### ${sec.name}`);
    for (const f of sec.findings) {
      const mark = f.status === 'pass' ? '✅' : f.status === 'fail' ? '❌' : f.status === 'warn' ? '⚠️' : '•';
      parts.push(`- ${mark} ${f.text}`);
    }
    parts.push('');
  }
  parts.push('_MeetToIssue 가 작성한 초안입니다. 확인 후 수정해서 남겨 주세요._');
  return parts.join('\n');
}

export function PullPage() {
  const { projectId = '', repoId = '', number = '' } = useParams();
  const id = Number(repoId);
  const num = Number(number);
  const nav = useNavigate();
  const toast = useToast();

  const project = useAsync(() => projectsApi.getProject(projectId), [projectId]);
  const repo = useAsync(() => reposApi.getProjectRepo(projectId, id), [projectId, id]);
  const pull = useAsync(() => pullsApi.getPull(id, num), [id, num]);

  const [sections, setSections] = useState<ReviewSection[]>(SECTIONS);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [comment, setComment] = useState('');
  const [edited, setEdited] = useState(false);
  const [posting, setPosting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const done = sections.every((x) => x.status === 'done');
  const generated = useMemo(() => toComment(sections), [sections]);

  useEffect(() => {
    if (done && !edited) setComment(generated);
  }, [done, generated, edited]);

  async function review() {
    if (!pull.data || running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setStarted(true);
    setEdited(false);
    setSections(SECTIONS.map((x) => ({ ...x, status: 'idle', findings: [], ms: undefined })));

    const patch = (agent: ReviewSection['agent'], p: Partial<ReviewSection>) =>
      setSections((prev) => prev.map((x) => (x.agent === agent ? { ...x, ...p } : x)));

    try {
      await agentsApi.runPrReview(id, pull.data, (e) => {
        switch (e.type) {
          case 'agent_start': patch(e.agent, { status: 'running' }); break;
          case 'findings': patch(e.agent, { findings: e.items }); break;
          case 'agent_done': patch(e.agent, { status: 'done', ms: e.ms, note: e.note }); break;
          case 'error': patch(e.agent, { status: 'error', note: e.message }); break;
          case 'done': break;
        }
      }, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) toast(e instanceof Error ? e.message : '리뷰에 실패했습니다', 'error');
    } finally {
      setRunning(false);
    }
  }

  async function post() {
    if (!comment.trim() || posting) return;
    setPosting(true);
    try {
      await pullsApi.postPullComment(id, num, comment);
      toast('리뷰를 PR 에 남겼습니다', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '남기지 못했습니다', 'error');
    } finally {
      setPosting(false);
    }
  }

  const pr = pull.data;

  return (
    <>
      <Header
        crumbs={[
          { label: project.data?.name ?? '프로젝트', to: `/p/${projectId}` },
          { label: repo.data?.name ?? '레포지토리', to: `/p/${projectId}/repos/${id}?tab=pulls` },
          { label: `#${num}` },
        ]}
      />
      <Page>
        <BackLink to={`/p/${projectId}/repos/${id}?tab=pulls`}>PR 목록</BackLink>

        {pull.error && (
          <Banner tone="error" title="PR 을 열 수 없습니다"
            actions={<Button size="sm" onClick={() => nav(`/p/${projectId}/repos/${id}?tab=pulls`)}>목록으로</Button>}>
            {pull.error}
          </Banner>
        )}

        <PageHead
          eyebrow={
            pr ? (
              <span className={s.branches}>
                <Icon name="pull-request" size={13} />
                <span className={s.branch}>{pr.head}</span>
                <Icon name="arrow-right" size={12} />
                <span className={s.branch}>{pr.base}</span>
              </span>
            ) : 'PR'
          }
          title={
            pr ? (
              <span className={s.prTitle}>
                {pr.title}
                <span className={s.num}>#{pr.number}</span>
                {pr.draft && <Tag tone="sunk">draft</Tag>}
                {pr.state === 'open' && <Tag tone="moss" dot>open</Tag>}
                {pr.state === 'merged' && <Tag tone="slate" dot>merged</Tag>}
                {pr.state === 'closed' && <Tag tone="brick" dot>closed</Tag>}
              </span>
            ) : <Skeleton width="60%" height={24} />
          }
          actions={
            pr && (
              <Button icon="external" onClick={() => window.open(pr.url, '_blank', 'noopener')}>GitHub</Button>
            )
          }
        />

        <div className={s.split}>
          <div>
            {pr && (
              <div className={s.stats}>
                <span className={s.stat}><Icon name="user" size={14} /> {pr.author}</span>
                <span className={s.stat}><Icon name="clock" size={14} /> {relativeTime(pr.updatedAt)}</span>
                <span className={s.stat}><Icon name="layers" size={14} /> <b>{pr.changedFiles}</b> 파일</span>
                <span className={s.add}>+{pr.additions}</span>
                <span className={s.del}>−{pr.deletions}</span>
                {pr.linkedIssue && <Tag tone="clay">#{pr.linkedIssue} 연결</Tag>}
              </div>
            )}

            <Card>
              <CardHead title="본문" sub={pr ? `${pr.author} 작성` : undefined} />
              <CardBody>
                {pull.loading ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <Skeleton width="90%" /><Skeleton width="76%" /><Skeleton width="84%" />
                  </div>
                ) : pr?.body ? (
                  <Body text={pr.body} />
                ) : (
                  <span style={{ color: 'var(--ink-500)', fontSize: 'var(--text-sm)' }}>본문이 비어 있습니다.</span>
                )}
              </CardBody>
            </Card>

            {started && (
              <Card>
                <CardHead
                  title="리뷰 코멘트 초안"
                  sub={running ? '작성 중' : '수정한 뒤 남길 수 있습니다'}
                />
                <CardBody>
                  <textarea
                    className={s.composer}
                    value={comment}
                    placeholder={running ? '에이전트가 읽는 중입니다…' : ''}
                    onChange={(e) => { setComment(e.target.value); setEdited(true); }}
                  />
                  <div className={s.composerBar}>
                    <span className={s.composerNote}>
                      {edited ? '직접 수정한 내용입니다.' : '에이전트가 만든 초안입니다.'}
                    </span>
                    {edited && (
                      <Button size="sm" onClick={() => { setComment(generated); setEdited(false); }}>
                        초안으로 되돌리기
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      icon="send"
                      disabled={!comment.trim() || running || posting}
                      onClick={() => void post()}
                    >
                      {posting ? '남기는 중…' : 'PR 에 코멘트 남기기'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>

          <aside className={s.aside}>
            <Button
              variant="primary"
              size="lg"
              block
              icon={running ? undefined : 'check-circle'}
              disabled={!pr || running}
              onClick={() => void review()}
            >
              {running ? <><Spinner size={14} /> 리뷰하는 중…</> : started ? 'AI 리뷰 다시 하기' : 'AI 리뷰'}
            </Button>

            {!started && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-500)', lineHeight: 1.8 }}>
                연결된 이슈의 요구사항과 변경 내용을 대조하고, 리뷰 코멘트 초안을 만들어 줍니다.
                남기기 전에 항상 직접 확인할 수 있습니다.
              </p>
            )}

            {started && sections.map((sec) => (
              <Card key={sec.agent}>
                <CardHead
                  title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Icon name={sec.icon} size={15} />{sec.name}
                  </span>}
                  sub={sec.status === 'running' ? <Spinner size={12} /> : sec.ms ? `${(sec.ms / 1000).toFixed(1)}s` : undefined}
                />
                <CardBody>
                  {sec.findings.length === 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Skeleton width="88%" /><Skeleton width="70%" />
                    </div>
                  ) : (
                    <div className={s.section}>
                      {sec.findings.map((f) => (
                        <div key={f.id} className={[s.finding, s[f.status]].join(' ')}>
                          <Icon name={FINDING_ICON[f.status]} size={14} />
                          <span>
                            {f.text}
                            {f.ref && <> <span className={s.ref}>{f.ref}</span></>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </aside>
        </div>
      </Page>
    </>
  );
}
