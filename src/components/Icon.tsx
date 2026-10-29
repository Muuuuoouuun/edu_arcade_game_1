type IconName = 'play' | 'back' | 'sound' | 'muted' | 'user' | 'gamepad' | 'keyboard' | 'pause' | 'close' | 'trophy' | 'star';
export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  const paths = {
    play: <path d="M8 5.5a1 1 0 0 1 1.5-.86l11 6.5a1 1 0 0 1 0 1.72l-11 6.5A1 1 0 0 1 8 18.5Z" fill="currentColor" stroke="none" />,
    back: <><path d="m10 5-7 7 7 7M3 12h18" /></>,
    sound: <><path d="M11 4 5 9H2v6h3l6 5Z" fill="currentColor" stroke="none" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    muted: <><path d="M11 4 5 9H2v6h3l6 5Z" fill="currentColor" stroke="none" /><path d="m16 9 6 6m0-6-6 6" /></>,
    user: <><circle cx="12" cy="7" r="4" fill="currentColor" stroke="none"/><path d="M3 22a9 9 0 0 1 18 0" fill="currentColor" stroke="none"/></>,
    gamepad: <><path d="M8 5h8c4 0 6 3 7 12 .5 4-4 4-7 0H8c-3 4-7.5 4-7 0 1-9 3-12 7-12Z" fill="currentColor" stroke="none"/><path d="M7 9v6m-3-3h6" stroke="#ffe16c"/><circle cx="16" cy="10" r="1.6" fill="white" stroke="none"/><circle cx="19" cy="14" r="1.6" fill="white" stroke="none"/></>,
    keyboard: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/></>,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0Zm5 11v6m-5 1h10M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4"/></>,
    star: <path d="m12 2 3.1 6.3 7 .9-5.1 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9L2 9.2l7-.9Z" fill="currentColor" stroke="none"/>,
  };
  return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
