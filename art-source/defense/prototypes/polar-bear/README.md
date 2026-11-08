# Polar bear guardian — isolated modeling prototype

Original editable Blender geometry informed by `art-source/defense/concepts/2026-11-09/polar-bear-guardian.png`: round bear ears/muzzle, chunky ivory and navy armor, blue circular ice shield, and short anchor-headed hammer. No production assets, loaders, combat rules, or manifests were changed.

## Files

- `polar-bear.blend`: 87 editable mesh objects, seven named rigid hierarchy nodes, animation, camera and studio lights.
- `polar-bear.glb`: articulated rigid objects, one `polar-bear-attack` clip, four rotation channels; no skinning.
- `polar-bear-{idle,windup,strike,recover}.png`: transparent 640×640 previews at source frames 1, 7, 11, 17.
- `polar-bear-model.json`: measured geometry counts, camera, pose bounds, facing projection, rendering settings and limitations.
- `reimport-validation.json`: results from a fresh Blender GLB import; `validate_reimport.py` reproduces that check.

## Reproduce

From the repository root, with Blender 4.3.2 (this environment: `/usr/bin/blender`):

```sh
blender -b -t 8 --python tools/blender/build_polar_bear.py -- --samples 24
blender -b -t 4 --python art-source/defense/prototypes/polar-bear/validate_reimport.py
```

The deterministic generator rebuilds only this prototype directory. `--skip-render` regenerates `.blend`, `.glb` and metadata without rendering PNGs; existing PNGs are retained and should be regenerated after geometry changes. Blender backup saves are disabled (`save_version=0`). The source `.blend` preserves separate editable objects; export copies are evaluated and batched by material and rigid parent.

## Measured validation

| Item | Result |
| --- | --- |
| Blender | 4.3.2 |
| GLB size | 425,648 bytes |
| GLB triangles | 9,176 |
| GLB material count | 9 |
| GLB mesh objects | 31 |
| Editable source mesh objects | 87 |
| Exported animation | One 0.8-second clip, 30 fps |
| Fresh import | Passed; matching triangle/material/mesh counts |
| Animation samples | Frames 0, 6, 10, 16, 24 after export slides start to zero |
| Animation sanity | Hammer moves during windup; frame 24 returns to initial position |
| Ground | All sampled poses have minimum world Z = 0 |
| Camera | Orthographic scale 5.45; location (7,10,7); common ground origin pixel (320.0003,550) |
| Facing | Authoring +Y; exported GLB -Z with Y-up. +Y projects +67.3423 horizontal pixels in the chosen camera, consistent with screen-right. Game-loader facing remains untested. |
| Render | Cycles CPU, 24 samples, RGBA, no denoiser (installed Blender lacks OpenImageDenoise) |

All four preview images were inspected. The shield and hammer stay visually separate, the hand wraps the shaft with finger bars and an opposing thumb, the round ears and projecting muzzle read as a bear, and no pose is clipped. Evaluated geometry stays inside the frame: minimum margin across poses is about 52 pixels at the bottom. The ground origin is an anchor, not the bottommost foot pixel; depth projects the near toes below it.

## Limits and next review

This is a bounded modeling prototype. Rigid object joints approximate articulation; there is no deforming armature, skin weighting, walking animation, collision setup or LOD. The strike turns the hammer head toward an edge-on view, reducing its anchor silhouette; attack timing and wrist orientation need a later animation pass. Raw 24-sample renders retain visible noise. Fine facial features will disappear at mobile scale; actual in-game 48/64/96-pixel readability and device performance have not been measured. Nine materials and 31 batches are reported counts, not an FPS claim. No production integration has been performed.

## Coordinator review

Astra authored the geometry and performed the Blender checks above. Opus 5.5 API reviewed the generator, metadata and actual idle/strike renders and found no prototype merge blocker. The GLB JSON was additionally checked: one animation named `polar-bear-attack`, four channels, 38 nodes, and no temporary `__editable` names.

Static Chromium inspection at 48/64/96 CSS pixels preserves the full canvas: shield/body color separation reads at 64/96px, while the 48px action/hammer silhouette needs further work. This is a static preview check, not game integration or mobile-device performance validation. The evidence is in the coordinator’s `arcana-api-production-20261109` workspace evidence directory.

The GLB contains one animation clip with four rotation channels. Blender reimport splits those channels into four object actions; the four entries in the validation JSON are not four independent GLB clips. Triangle, material and mesh counts are all asserted against export metadata.
