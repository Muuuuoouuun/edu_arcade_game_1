import { memo, useId } from 'react';
import type { DefenseThemeId } from '../games/defense/themes';

// Presentation only: these landmarks never contribute collision, range or damage.
// Each gate fits the original town silhouette; the road and build pads stay clear.
const PALETTES = {
  verdant: { stone: '#c4c2a1', shade: '#687c66', roof: '#426c55', trim: '#bc9a59', banner: '#25573f', glow: '#ffde93' },
  steel: { stone: '#c9ccce', shade: '#657789', roof: '#354c66', trim: '#cbb17b', banner: '#325f8e', glow: '#ffe3a2' },
  unryeong: { stone: '#bab6a6', shade: '#687470', roof: '#344950', trim: '#c6a363', banner: '#a74e39', glow: '#ffda8c' },
  twilight: { stone: '#a9a6ba', shade: '#635d78', roof: '#3b3c5a', trim: '#bea47a', banner: '#75425f', glow: '#ffd293' },
} satisfies Record<DefenseThemeId, object>;

function Lantern({ x, y, color }: { x: number; y: number; color: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-4-3H4V5H-4Z" fill={color}/><path d="M-5-4 0-7 5-4ZM-5 5H5V7H-5Z" fill="#4c493c"/>
    <path d="M0-3V5" stroke="#fff0c1" strokeWidth="1"/>
  </g>;
}

function Pennant({ x, y, color, leaf = false }: { x: number; y: number; color: string; leaf?: boolean }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-6 0H6V21L0 25-6 21Z" fill={color} stroke={leaf ? '#d0e3b2' : '#d8bc7c'} strokeWidth={leaf ? 1.2 : .8}/>
    {leaf ? <path d="M0 17C-10 12-3 5 3 4 6 10 4 14 0 17ZM0 18 2 8" fill="#d3d29e" stroke="#e7d99e" strokeWidth=".8"/> : <path d="m0 5 3 6-3 7-3-7ZM-4 11H4" fill="none" stroke="#ead4a1" strokeWidth="1.2"/>}
    <path d="M-8-1H8" stroke="#d8bc7c" strokeWidth="2"/>
  </g>;
}

/** Small static architecture, memoized independently of the 60 Hz battle state. */
const Gate = memo(function Gate({ themeId, snow, outpost = false }: { themeId: DefenseThemeId; snow: boolean; outpost?: boolean }) {
  const uid = useId(), p = PALETTES[themeId], wood = themeId === 'verdant', east = themeId === 'unryeong', night = themeId === 'twilight';
  return <g transform={`translate(${outpost ? 852 : 850} ${outpost ? 131 : 318}) scale(${outpost ? .82 : 1})`} data-gate-theme={themeId} data-gate={outpost ? 'outpost' : 'village'}>
    <defs>
      <linearGradient id={`${uid}-stone`} x1="0" y1="0" x2="1" y2=".7"><stop stopColor={p.stone}/><stop offset="1" stopColor={p.shade}/></linearGradient>
      <linearGradient id={`${uid}-door`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#392f2d"/><stop offset="1" stopColor="#8f7550"/></linearGradient>
    </defs>
    <ellipse cy="1" rx="48" ry="10" fill="#18312b" opacity=".25"/>
    <path d="M-46-6-28-16H32L47-5 38 5H-37Z" fill={snow ? '#d8e6e8' : '#9c9d7f'} stroke={p.shade} strokeWidth="1.2"/>
    <path d="M-39-8H40V-55H-39Z" fill={`url(#${uid}-stone)`} stroke={p.shade} strokeWidth="1.8"/>
    <path d="M-39-40H40M-39-24H40M-22-55V-40M14-55V-40M-29-40V-24M27-40V-24M-24-24V-8M27-24V-8" stroke={p.shade} strokeWidth="1" opacity=".6"/>
    <path d={east ? 'M-18-8V-42H18V-8Z' : 'M-18-8V-27Q0-57 18-27V-8Z'} fill={`url(#${uid}-door)`} stroke={p.trim} strokeWidth="4"/>
    {east ? <g><path d="M-12-10V-39M-6-10V-39M0-10V-40M6-10V-39M12-10V-39M-15-32H15M-15-15H15" stroke="#b99765" strokeWidth="1.3"/><circle cx="-4" cy="-24" r="1.6" fill="none" stroke="#e1c38a" strokeWidth="1.2"/><circle cx="4" cy="-24" r="1.6" fill="none" stroke="#e1c38a" strokeWidth="1.2"/></g> : <path d="M-11-10V-28M-5-10V-35M2-10V-37M9-10V-31M-15-20H15M-10-31H10" stroke="#c1a77b" strokeWidth="1.5" opacity=".7"/>}
    <path d="M-22-5H22L27 0H-28Z" fill={snow ? '#e9f1ef' : '#d9c79b'}/>

    {wood ? <>
      <path d="M-37-5C-28-22-44-42-31-64L-24-68C-30-44-23-22-22-11M38-5C25-22 41-42 29-65L22-68C27-41 22-23 22-10" fill="#806c45" stroke="#4d654c" strokeWidth="3"/>
      <path d="M-34-7-43 1M-30-8-18 0M31-8 43 1M29-9 19 1" stroke="#87734b" strokeWidth="5" strokeLinecap="round"/>
      <path d="M-46-55Q-26-83 0-74 26-83 45-55L30-48 0-55-30-48Z" fill={p.roof} stroke="#315b48" strokeWidth="2"/>
      <path d="M-34-61Q-14-89 9-79 28-82 34-65L10-61-9-65Z" fill="#75976a"/>
      <path d="M-19-73Q-11-101 9-92L23-73 6-69Z" fill="#557b58"/>
      <path d="M-4-61 2-85M-4-70-15-78M0-77 11-84" stroke="#b9c58d" strokeWidth="1.3" opacity=".75"/>
      <Pennant x={-31} y={-45} color={p.banner} leaf/><Pennant x={31} y={-45} color={p.banner} leaf/>
      <path d="m0-63 6 7-6 7-6-7Z" fill="#b4e6b8" stroke={p.trim} strokeWidth="1.5"/>
      <path d="M-43-8Q-49-19-39-21-34-14-43-8M40-7Q51-15 44-22 36-20 40-7" fill="#668b56"/>
      {[-1, 1].map(side => <g key={side} transform={`translate(${side * 43} 0)`}><path d="M-4-6H4V-16H-4Z" fill={p.shade} stroke={p.trim} strokeWidth="1"/><path d="M0-32 5-23 0-14-5-23Z" fill="#77d8ac" stroke="#dcf7c9" strokeWidth="1.4"/><path d="M0-30V-16L4-23Z" fill="#c8f1be"/></g>)}
    </> : east ? <>
      <path d="M-31-51H-25V-81H-31ZM25-51H31V-81H25Z" fill="#994e36" stroke="#604e3b" strokeWidth="1.5"/>
      <path d="M-33-73H33V-56H-33Z" fill="#c8ad74" stroke="#766348" strokeWidth="1.5"/>
      <path d="M-27-72V-58M-17-72V-58M-7-72V-58M7-72V-58M17-72V-58M27-72V-58M-30-63H30" stroke="#72503b" strokeWidth="2"/>
      <path d="M-49-73Q-29-73-20-91H20Q29-73 49-73L43-67H-43Z" fill={p.roof} stroke="#243b42" strokeWidth="2"/>
      <path d="M-20-91H20M-45-72Q0-82 45-72" fill="none" stroke={snow ? '#deeded' : '#a5b7b1'} strokeWidth={snow ? 3.3 : 1.5}/>
      <path d="M-17-88-30-73M-9-88-15-76M0-88V-77M9-88 15-76M17-88 30-73" stroke="#80928d" strokeWidth="1.2"/>
      <path d="M-34-53H34L40-48H-40Z" fill="#466357" stroke={p.trim} strokeWidth="1.2"/>
      <Pennant x={-31} y={-43} color={p.banner}/><Pennant x={31} y={-43} color={p.banner}/>
      <path d="M-6-69H6V-58H-6Z" fill="#efe1ae" stroke={p.trim}/><path d="M-3-66H3L-2-63H2L-2-60" fill="none" stroke="#a34e3b" strokeWidth="1.4"/>
      <path d="M-41-6V-21M42-6V-21" stroke="#605d49" strokeWidth="3"/>
    </> : <>
      {[-1, 1].map(side => <g key={side} transform={`translate(${side * 31} 0)`}>
        <path d="M-12-10V-65H11V-10L0-6Z" fill={`url(#${uid}-stone)`} stroke={p.shade} strokeWidth="1.5"/>
        <path d="M2-63V-9M-11-42H11M-11-27H11" stroke={p.shade} strokeWidth="1" opacity=".8"/>
        {night ? <><path d="M-16-64-1-99 15-64Z" fill={p.roof} stroke="#32384f" strokeWidth="2"/><path d="M-1-95 5-66" stroke="#858496" strokeWidth="1.4"/><path d="M-3-91 0-103 2-91" fill={p.trim}/></> : <><path d="M-14-65V-75H-7V-69H-1V-76H5V-69H12V-75H15V-64Z" fill={p.stone} stroke={p.shade} strokeWidth="1.5"/><path d="M-9-63H10" stroke={p.trim} strokeWidth="2"/></>}
        <Pennant x={-1} y={-49} color={p.banner}/>
      </g>)}
      {night ? <>
        <path d="M-21-54V-65L0-84 21-65V-54Z" fill={p.stone} stroke={p.shade} strokeWidth="1.5"/>
        <path d="M-24-64 0-88 24-64" fill="none" stroke={p.roof} strokeWidth="5"/>
        <path d="M-6-58V-67Q0-79 6-67V-58Z" fill={p.glow} stroke={p.roof} strokeWidth="1.5"/>
        <path d="M1-72V-59M-5-64H5" stroke={p.roof} strokeWidth="1.4"/>
        <path d="M-45-4-49-14-44-25-39-14Z" fill="#bdb0ec" stroke="#69658c" strokeWidth="1.4"/>
        <path d="M-44-23V-7L-40-14Z" fill="#e4d1ff"/>
        <path d="M25-94A6 6 0 1 0 31-88 6 6 0 0 1 25-94" fill="#eddcaf"/>
      </> : <>
        <path d="M-20-55V-65H-14V-59H-5V-66H2V-59H12V-65H20V-55Z" fill={p.stone} stroke={p.shade} strokeWidth="1.5"/>
        <path d="M-8-55H8V-44L0-39-8-44Z" fill={p.banner} stroke={p.trim} strokeWidth="1.2"/><path d="M0-52V-43M-3-47H3" stroke="#efe2b0" strokeWidth="1.4"/>
        <path d="M-34-76V-94M28-76V-94" stroke={p.trim} strokeWidth="1.6"/><path d="M-33-94-19-90-33-85ZM29-94 42-90 29-85Z" fill={p.banner} stroke={p.trim} strokeWidth=".7"/>
        <path d="M-39-17-49-20-48-26-37-24Z" fill="#4a5661" stroke="#a0a7a5" strokeWidth="1"/>
        <ellipse cx="-48" cy="-23" rx="2" ry="3.2" fill="#283a43"/>
      </>}
    </>}
    <Lantern x={-20} y={-25} color={p.glow}/><Lantern x={20} y={-25} color={p.glow}/>
    {snow ? <g fill="#e8f2ef" opacity=".95"><path d="M-43-7Q-34-12-25-7L-29-3H-43ZM24-7Q36-11 44-6L40-2H28Z"/><path d={wood ? 'M-27-73Q-12-84 4-78L0-74-15-74Z' : east ? 'M-19-92H20L17-89H-18Z' : 'M-13-56H13V-53H-13Z'}/></g> : null}
  </g>;
});

export const DefenseThemeScenery = memo(function DefenseThemeScenery({ themeId, snow, expanded, outpostFallen }: {
  themeId: DefenseThemeId; snow: boolean; expanded: boolean; outpostFallen: boolean;
}) {
  return <g className="def-theme-scenery" pointerEvents="none" aria-hidden="true">
    <Gate themeId={themeId} snow={snow}/>
    {expanded ? <g opacity={outpostFallen ? .4 : 1}><Gate themeId={themeId} snow={snow} outpost/></g> : null}
  </g>;
});
