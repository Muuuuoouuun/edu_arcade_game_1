# Bron motion workshop

Open `/model-lab.html?model=dwarf-guardian`. This is a production review prototype, separate from the battle renderer. No combat rules, GLB geometry, sprite atlases or saves changed.

## Motion concept and implementation

A watchful engineer keeps his feet planted while breathing under heavy armor. The existing Bron GLB has real object joints: `body` owns `head`, `guard-arm`, and `hammer-arm`; the weapon follows `hammer-arm → hammer-forearm → hammer`. Feet remain siblings of `body` under `dwarf-guardian`.

`src/model-lab-motion.ts` animates body lift (0.011 authoring units), body sway (0.012 rad), head counter-nod (0.012 rad) and small shoulder rotations (0.022 / 0.016 rad). The 0.21 Hz breath and 0.12 Hz sway ease in over 0.4 s. It never detaches or independently translates the weapon. Rest transforms are captured once; update allocates no objects.

The idle is opt-in. Attack, hit, static pose review, model selection and reduced-motion changes stop idle and restore the rest transforms before the animation mixer takes ownership. Returning from a hidden tab resets the frame clock; hidden tabs do not advance procedural or authored motion. Reduced motion disables playback but keeps all static review poses available.

## Authored review poses

These reuse `dwarf-hammer-attack`, verified as 25 samples over 0.8 seconds. The original authoring source is `tools/blender/build_dwarf.py`:

| Review | Authoring frame | Clip time | Progress |
| --- | ---: | ---: | ---: |
| Anticipation / 준비 | 7 | 0.20 s | 25% |
| Impact / 타격 | 11 | 0.3333 s | 41.6667% |
| Recovery / 복귀 | 17 | 0.5333 s | 66.6667% |

These controls only appear on Bron. Other characters retain their existing authored animation and slider. Existing tower recoil is unchanged.

## Claude contribution and evidence

Official Anthropic `claude-fable-5-1` was consulted before implementation. Applied recommendations: exclusive procedural/mixer ownership, rest restoration before mixer activation, capture at model load, unchanged hammer hierarchy, opt-in breathing, visibility clock reset and render gating. Claude's suggested pose percentages were explicitly placeholders; the shipped percentages instead come from the verified authoring frames above.

Evidence directory: `/workspace/.cloud-setup/evidence/arcana-pivot-20261109/model-motion/`. It contains the redacted request/receipt and partial response (response reached its token limit after delivering substantive recommendations), verification script/results, screenshots and a real browser video. The initial request exhausted its budget on reasoning and is retained separately as `claude-motion-first-receipt.json`. No credentials are in frontend code.

Validation: TypeScript check; procedural joint movement / fixed feet / exact reset / missing rig checks; desktop transitions and repeated attacks; mobile 390 px overflow; reduced-motion static pose review; switching models. Runtime recording is a Three.js browser capture, not generated video.

Before battle integration: decide the actual renderer path (current battle uses sprites), bake or implement equivalent animation there, review weapon silhouette at actual battle size, then test combat-state timing. This workshop does not imply that integration is complete.
