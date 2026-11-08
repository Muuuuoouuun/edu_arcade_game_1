# Gecko ranger — original modeling prototype

Original chunky mobile fantasy ranger geometry, guided by `art-source/defense/concepts/2026-11-09/gecko-ranger.png`. The model keeps the reference's green gecko, large golden slit eyes, open leaf hood, broad leaf cape, thick curled tail and two-handed seed crossbow. The geometry is authored directly; the concept image is not embedded as a texture.

## Deliverables

- `gecko-ranger.blend`: editable source geometry, named rigid pivots, animation and preview studio.
- `gecko-ranger.glb`: one `gecko-seed-shot` clip with anticipation, recoil, recovery and exact loop return.
- `gecko-ranger-{idle,windup,strike,recover}.png`: transparent 640×640 previews at source frames 1, 8, 12 and 21.
- `gecko-ranger-model.json`: measured counts, axes, per-pose world/projected bounds and camera settings.
- `validate_reimport.py` and `reimport-validation.json`: reproducible fresh-process GLB validation and its measured result.

## Reproduce

From the repository root using Blender 4.3.2:

```sh
blender -b -t 6 --python tools/blender/build_gecko.py -- --samples 32
blender -b -t 4 --python art-source/defense/prototypes/gecko-ranger/validate_reimport.py
```

The generator writes only this prototype directory. `--skip-render` updates the model and metadata while retaining any existing preview images; regenerate previews after changing geometry or animation. The source contains separate editable objects. Evaluated export copies are batched by rigid parent and material. Blender backup saves are disabled.

## Measured budget and checks

| Item | Measured result |
| --- | --- |
| Editable source meshes | 87 |
| Runtime meshes / material batches | 24 |
| Runtime triangles | 7,804 |
| Materials | 9 |
| GLB size | 261,840 bytes |
| Animation | One 1.0-second clip, 30 fps, five channels |
| Coordinates | Source +Z up / +Y forward; GLB +Y up / −Z forward |
| Ground | Feet have minimum source Z=0 at every imported frame 0–30 |
| Loop | Every object transform returns exactly to its initial value |
| Camera bounds | All 31 imported frames are inside the fixed frame; minimum margin 47.647 pixels |
| Camera | Orthographic 5.45; location (7,10,7); origin projects to (320.0003,550) |
| Render | Cycles CPU, 32 samples, RGBA; denoising off because this build lacks OpenImageDenoise |

The fresh import validator checks glTF clip name/duration/channels, rigid parents, all 31 integer-frame vertex sets, grounding, complete camera framing, visible weapon recoil, exact loop return and matching mesh/material/triangle counts. Blender creates four per-object actions on import; these are channels of the single exported clip, not four separate GLB clips.

The broad cape and open hood use a few folded leaf masses. The complete tapered tail extends behind the body and curls upward, separate from the crossbow. The wood stock passes through a wrapped trigger grip; the opposite palm supports its underside, with curled fingers over the side. The string connects both bow tips to the drawn center. The fixed camera and grounded feet are consistent with the polar-bear prototype previews.

## Limits

This is a rigid-object prototype with no deforming armature, walk cycle, collision shapes or LOD. The seed remains a loaded visual prop; firing is represented by the pose and recoil, with projectile/combat behavior left to integration. The hands stay attached to the weapon assembly; shoulder motion is approximate. Noise remains in the low-sample renders. Counts are reported for budgeting and do not establish mobile FPS. Tiny eye highlights, fingers and string will lose detail at the smallest display sizes.
