import type { SVGProps } from 'react';

export type IconName =
  | 'github' | 'folder' | 'folder-open' | 'plus' | 'chevron-right' | 'chevron-down'
  | 'search' | 'note' | 'repo' | 'issue' | 'pull-request' | 'check' | 'check-circle'
  | 'alert' | 'x' | 'pencil' | 'trash' | 'external' | 'arrow-left' | 'arrow-right'
  | 'stop' | 'dot' | 'clock' | 'user' | 'tag' | 'calendar' | 'copy' | 'send'
  | 'layers' | 'quote' | 'more';

/** feather 계열 24x24 스트로크 패스. 이모지 대신 일관된 선 아이콘을 쓴다. */
const PATHS: Record<IconName, string> = {
  'github': 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 19.9 5a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.7 12.7 0 0 0-6.6 0C6.9 1.1 5.8 1.4 5.8 1.4A4.9 4.9 0 0 0 5.7 5a5.2 5.2 0 0 0-1.4 3.7c0 5.2 3.2 6.4 6.2 6.7A3.4 3.4 0 0 0 9.6 18v4',
  'folder': 'M4 6a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  'folder-open': 'M4 19V6a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8H18a2 2 0 0 1 2 2v1M4 19l2.2-7.3a2 2 0 0 1 1.9-1.4H21a1 1 0 0 1 1 1.3L20 19a2 2 0 0 1-1.9 1.4H6a2 2 0 0 1-2-1.4z',
  'plus': 'M12 5v14M5 12h14',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  'search': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  'note': 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  'repo': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  'issue': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'pull-request': 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v6M18 15V9a3 3 0 0 0-3-3h-4m0 0 2.5-2.5M11 6l2.5 2.5',
  'check': 'M4 12.5l5 5L20 6.5',
  'check-circle': 'M21 11.1V12a9 9 0 1 1-5.3-8.2M21.5 5 12 14.5l-2.8-2.8',
  'alert': 'M12 9v5M12 18h.01M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  'x': 'M18 6 6 18M6 6l12 12',
  'pencil': 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  'trash': 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  'external': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'stop': 'M7 7h10v10H7z',
  'dot': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'clock': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  'user': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'tag': 'M20.6 13.4 12 22l-9-9V3h10zM7.5 7.5h.01',
  'calendar': 'M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M4 11h16',
  'copy': 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  'send': 'M21 3 3 10.5l7 3 3 7z',
  'layers': 'M12 2 2 8l10 6 10-6zM2 16l10 6 10-6M2 12l10 6 10-6',
  'quote': 'M6 17h3l2-4V6H5v7h3zM15 17h3l2-4V6h-6v7h3z',
  'more': 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
};

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** true면 면으로 채운다(점·상태 표시용) */
  filled?: boolean;
}

export function Icon({ name, size = 16, filled, style, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flexShrink: 0, display: 'block', ...style }}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
