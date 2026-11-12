export const FRONTIER_THEMES={
 forest:{name:'녹음 협곡',detail:'높은 숲 · 목조 성문',terrain:'frontier-terrain',gate:'forest-gate',sky:'#abc9c5'},
 frost:{name:'서리 협곡',detail:'눈 덮인 숲 · 설산 성문',terrain:'frontier-frost-forest',gate:'frontier-frost-gate',sky:'#a6c1d9'},
} as const;
export type FrontierTheme=keyof typeof FRONTIER_THEMES;
