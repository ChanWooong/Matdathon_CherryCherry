import s from './Loading.module.css';

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className={s.spinner} style={{ width: size, height: size }} role="status" aria-label="불러오는 중" />;
}

export function Dots() {
  return <span className={s.dots} aria-hidden><i /><i /><i /></span>;
}

interface SkeletonProps {
  width?: number | string;
  height?: number;
  className?: string;
}

export function Skeleton({ width = '100%', height = 12, className }: SkeletonProps) {
  return <span className={[s.skeleton, className].filter(Boolean).join(' ')} style={{ width, height, display: 'block' }} />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 14, padding: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          <Skeleton width={`${52 + ((i * 13) % 34)}%`} height={13} />
          <Skeleton width={`${28 + ((i * 7) % 18)}%`} height={10} />
        </div>
      ))}
    </div>
  );
}
