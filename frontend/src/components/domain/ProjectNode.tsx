import type { CSSProperties } from 'react';
import { Icon } from '../ui';
import { relativeTime } from '../../lib/format';
import type { Project, ProjectAccent } from '../../types';
import s from './ProjectNode.module.css';

const ACCENT: Record<ProjectAccent, { line: string; soft: string }> = {
  clay: { line: 'var(--clay)', soft: 'var(--clay-050)' },
  moss: { line: 'var(--moss)', soft: 'var(--moss-050)' },
  ochre: { line: 'var(--ochre)', soft: 'var(--ochre-050)' },
  slate: { line: 'var(--slate)', soft: 'var(--slate-100)' },
  brick: { line: 'var(--brick)', soft: 'var(--brick-050)' },
};

interface Props {
  project: Project;
  onOpen: (id: string) => void;
}

/** 홈에서 폴더처럼 눌러 들어가는 프로젝트 노드 */
export function ProjectNode({ project, onOpen }: Props) {
  const accent = ACCENT[project.accent] ?? ACCENT.clay;
  const style = { '--accent': accent.line, '--accentSoft': accent.soft } as CSSProperties;

  return (
    <button className={s.node} style={style} onClick={() => onOpen(project.id)}>
      <div className={s.tab} />
      <div className={s.body}>
        <div className={s.top}>
          <span className={s.dot} />
          <span className={s.name}>{project.name}</span>
        </div>
        {project.description && <span className={s.desc}>{project.description}</span>}
        <div className={s.stats}>
          <span className={s.stat}><Icon name="repo" size={13} /> 레포 <b>{project.repoCount}</b></span>
          <span className={s.stat}><Icon name="note" size={13} /> 회의록 <b>{project.meetingCount}</b></span>
          <span className={s.date}>{relativeTime(project.createdAt)}</span>
        </div>
      </div>
    </button>
  );
}

export function AddProjectNode({ onClick }: { onClick: () => void }) {
  return (
    <button className={[s.node, s.add].join(' ')} onClick={onClick}>
      <div className={s.tab} />
      <div className={s.body}>
        <Icon name="plus" size={22} />
        <span className={s.addLabel}>새 프로젝트</span>
        <span className={s.addHint}>레포지토리와 회의록을 묶어 둡니다</span>
      </div>
    </button>
  );
}
