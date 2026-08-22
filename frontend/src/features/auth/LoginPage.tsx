import { Navigate, useLocation } from 'react-router-dom';
import { Button, Icon, Spinner } from '../../components/ui';
import { useAuth } from './AuthContext';
import { IS_MOCK } from '../../api';
import s from './LoginPage.module.css';

const STEPS = [
  '프로젝트를 만들고 관련 레포지토리를 묶습니다',
  '회의록을 붙여넣어 프로젝트에 보관합니다',
  '보관한 회의록을 골라 레포지토리에 이슈로 올립니다',
];

const SCOPES = [
  ['repo', '이슈와 PR 을 읽고 씁니다'],
  ['read:org', '소속 조직의 레포지토리 목록을 봅니다'],
];

export function LoginPage() {
  const { user, ready, signingIn, signIn } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <Spinner size={22} />
      </div>
    );
  }
  if (user) return <Navigate to={from ?? '/'} replace />;

  return (
    <div className={s.wrap}>
      <div className={s.left}>
        <div className={s.leftInner}>
          <div className={s.mark}>Meet<em>·</em>to<em>·</em>Issue</div>
          <h1 className={s.headline}>
            회의에서 정한 일이<br />
            <u>이슈로 남지 않는다면</u><br />
            정한 적 없는 일이 됩니다.
          </h1>
          <p className={s.sub}>
            회의록을 붙여넣으면 할 일과 결정사항을 가려내고,
            검토를 거친 뒤 원하는 레포지토리에 이슈로 올립니다.
          </p>
          <ol className={s.steps}>
            {STEPS.map((text, i) => (
              <li key={text} className={s.step}>
                <span className={s.num}>{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className={s.right}>
        <div className={s.card}>
          <div className={s.cardTitle}>시작하기</div>
          <p className={s.cardDesc}>
            GitHub 계정으로 로그인하면 접근 권한이 있는 레포지토리를 바로 가져옵니다.
          </p>

          <Button
            variant="primary"
            size="lg"
            icon="github"
            block
            onClick={() => void signIn()}
            disabled={signingIn}
          >
            {signingIn ? '연결하는 중…' : 'GitHub 계정으로 계속하기'}
          </Button>

          <div className={s.scopes}>
            {SCOPES.map(([scope, desc]) => (
              <div key={scope} className={s.scope}>
                <Icon name="check" size={14} />
                <span><b style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{scope}</b> — {desc}</span>
              </div>
            ))}
          </div>

          <p className={s.fine}>
            {IS_MOCK
              ? '지금은 목 모드입니다. 실제 GitHub 인증 없이 데모 계정으로 들어갑니다.'
              : '이슈 생성은 항상 사용자가 내용을 확인하고 승인한 뒤에만 실행됩니다.'}
          </p>
        </div>
      </div>
    </div>
  );
}
