type SvgProps = React.SVGProps<SVGSVGElement>;

export const Ico = {
  up: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 4l8 9h-5v7H9v-7H4z" />
    </svg>
  ),
  down: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 20l-8-9h5V4h6v7h5z" />
    </svg>
  ),
  eye: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  ),
  mute: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M4 9h4l5-5v16l-5-5H4z" />
      <line x1="17" y1="8" x2="22" y2="16" />
      <line x1="22" y1="8" x2="17" y2="16" />
    </svg>
  ),
  sound: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M4 9h4l5-5v16l-5-5H4z" />
      <path d="M16 8a5 5 0 010 8" />
      <path d="M19 5a9 9 0 010 14" />
    </svg>
  ),
  play: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M6 4l14 8-14 8z" />
    </svg>
  ),
  logout: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  key: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3" />
    </svg>
  ),
  plus: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  subs: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="17" y2="18" />
      <circle cx="20" cy="18" r="2" />
      <line x1="22" y1="16" x2="20" y2="18" />
    </svg>
  ),
};
