import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { meetings as meetingsApi, projects as projectsApi } from '../../api';
import { BackLink, Header, Page, PageHead } from '../../components/layout';
import { Banner, Button, Icon, TextArea, TextInput, useToast } from '../../components/ui';
import { useAsync } from '../../lib/useAsync';
import { countLines } from '../../lib/format';
import s from './MeetingEditorPage.module.css';

export function MeetingEditorPage() {
  const { projectId = '', meetingId } = useParams();
  const isNew = !meetingId || meetingId === 'new';
  const nav = useNavigate();
  const toast = useToast();

  const project = useAsync(() => projectsApi.getProject(projectId), [projectId]);
  const existing = useAsync(
    () => (isNew ? Promise.resolve(null) : meetingsApi.getMeeting(projectId, meetingId!)),
    [projectId, meetingId],
  );

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setContent(existing.data.content);
    }
  }, [existing.data]);

  const canSave = title.trim().length > 0 && content.trim().length > 0 && !saving;

  async function save(thenCreateIssue = false) {
    if (!canSave) { setTouched(true); return; }
    setSaving(true);
    try {
      const saved = isNew
        ? await meetingsApi.createMeeting(projectId, { title, content })
        : await meetingsApi.updateMeeting(projectId, meetingId!, { title, content });
      toast(isNew ? '회의록을 보관했습니다' : '회의록을 저장했습니다', 'success');
      if (thenCreateIssue) nav(`/p/${projectId}/issues/new?meeting=${saved.id}`);
      else nav(`/p/${projectId}?tab=meetings`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header
        crumbs={[
          { label: project.data?.name ?? '프로젝트', to: `/p/${projectId}` },
          { label: isNew ? '새 회의록' : title || '회의록' },
        ]}
      />
      <Page width="narrow">
        <BackLink to={`/p/${projectId}?tab=meetings`}>회의록 목록</BackLink>
        <PageHead
          eyebrow={<><Icon name="note" size={13} /> 회의록</>}
          title={isNew ? '회의록 붙여넣기' : '회의록 수정'}
          desc="따로 정리할 필요 없습니다. 회의 중 적은 그대로 붙여넣으세요."
        />

        {existing.error && <Banner tone="error">{existing.error}</Banner>}

        <div className={s.editor}>
          <TextInput
            label="제목"
            className={s.titleInput}
            placeholder="예) 8/21 스프린트 점검"
            value={title}
            autoFocus={isNew}
            error={touched && !title.trim() ? '제목을 입력해 주세요.' : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />

          <TextArea
            label="내용"
            paper
            className={s.area}
            placeholder={'참석자: 민지, 재호, 수진\n\n- 로그인 토큰 만료 버그 → 재호가 이번 주까지\n- 온보딩 문서 정리 필요 (민지)\n- 배포는 금요일에 하기로 정함'}
            value={content}
            error={touched && !content.trim() ? '회의록 내용을 붙여넣어 주세요.' : undefined}
            onChange={(e) => setContent(e.target.value)}
          />

          <div className={s.statusBar}>
            <span className={s.stat}>{countLines(content)}줄 · {content.length}자</span>
            <span className={s.spacer}>
              <Button onClick={() => nav(`/p/${projectId}?tab=meetings`)}>취소</Button>
              <Button icon="check" onClick={() => void save(false)} disabled={!canSave}>
                {saving ? '저장 중…' : '보관하기'}
              </Button>
              <Button variant="primary" iconRight="arrow-right" onClick={() => void save(true)} disabled={!canSave}>
                보관하고 이슈 만들기
              </Button>
            </span>
          </div>

          <p className={s.tip}>
            <b>이렇게 적으면 더 잘 읽어냅니다.</b><br />
            첫 줄에 <code>참석자: 이름, 이름</code> 을 적고, 할 일은 <code>-</code> 로 시작하는 줄에 하나씩.
            담당자는 <code>(이름)</code> 이나 <code>@아이디</code>, 기한은 <code>8/23</code> 처럼 적어 주세요.
          </p>
        </div>
      </Page>
    </>
  );
}
