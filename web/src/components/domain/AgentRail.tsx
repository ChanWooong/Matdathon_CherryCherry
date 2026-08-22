import { Icon, Spinner } from '../ui';
import type { AgentState } from '../../types';
import s from './AgentRail.module.css';

/** 에이전트 3단계 진행 상황. 이슈 생성과 PR 리뷰에서 같이 쓴다. */
export function AgentRail({ agents }: { agents: AgentState[] }) {
  return (
    <div className={s.rail}>
      {agents.map((a, i) => (
        <div key={a.id} className={[s.agent, s[a.status]].join(' ')}>
          <span className={s.mark}>
            {a.status === 'running' ? <Spinner size={14} /> : <Icon name={a.icon} size={15} />}
          </span>
          <span className={s.body}>
            <span className={s.name}>
              <span className={s.step}>{String(i + 1).padStart(2, '0')}</span>
              {a.name}
              {a.status === 'done' && a.ms !== undefined && (
                <span className={s.ms}>{(a.ms / 1000).toFixed(1)}s</span>
              )}
            </span>
            <span className={s.note}>
              {a.note}
              {a.status === 'running' && <i className={s.caret} />}
            </span>
            {a.status === 'running' && a.progress !== undefined && (
              <span className={s.track}>
                <span className={s.fill} style={{ width: `${a.progress}%` }} />
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
