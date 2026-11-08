# Polar bear guardian — isolated modeling prototype

Original editable Blender geometry informed by `art-source/defense/concepts/2026-11-09/polar-bear-guardian.png`: round bear ears/muzzle, chunky ivory and navy armor, blue circular ice shield, and short anchor-headed hammer. No production assets, loaders, combat rules, or manifests were changed.

## Files

- `polar-bear.blend`: 87 editable mesh objects, seven named rigid hierarchy nodes, animation, camera and studio lights.
- `polar-bear.glb`: articulated rigid objects, one `polar-bear-attack` clip, five rotation channels; no skinning.
- `polar-bear-{idle,windup,strike,recover}.png`: transparent 640×640 previews at source frames 1, 7, 11, 17.
- `polar-bear-model.json`: measured geometry counts, camera, pose bounds, facing projection, rendering settings and limitations.
- `reimport-validation.json`: results from a fresh Blender GLB import; `validate_reimport.py` reproduces that check.

## Reproduce

From the repository root, with Blender 4.3.2 (this environment: `/usr/bin/blender`):

```sh
blender -b -t 8 --python tools/blender/build_polar_bear.py -- --samples 64
blender -b -t 4 --python art-source/defense/prototypes/polar-bear/validate_reimport.py
```

The deterministic generator rebuilds only this prototype directory. `--skip-render` regenerates `.blend`, `.glb` and metadata without rendering PNGs; existing PNGs are retained and should be regenerated after geometry changes. Blender backup saves are disabled (`save_version=0`). The source `.blend` preserves separate editable objects; export copies are evaluated and batched by material and rigid parent.

## Measured validation

| Item | Result |
| --- | --- |
| Blender | 4.3.2 |
| GLB size | 426,268 bytes |
| GLB triangles | 9,176 |
| GLB material count | 9 |
| GLB mesh objects | 31 |
| Editable source mesh objects | 87 |
| Exported animation | One 0.8-second clip, 30 fps |
| Fresh import | Passed; matching triangle/material/mesh counts |
| Animation samples | Frames 0, 6, 10, 16, 24 after export slides start to zero |
| Animation sanity | Hammer moves during windup; frame 24 returns to initial position |
| Ground | All 25 source frames have minimum world Z = 0 |
| Camera | Orthographic scale 5.45; location (7,10,7); common ground origin pixel (320.0003,550) |
| Facing | Authoring +Y; exported GLB -Z with Y-up. +Y projects +67.3423 horizontal pixels in the chosen camera, consistent with screen-right. Game-loader facing remains untested. |
| Render | Cycles CPU, 64 samples, RGBA, no denoiser (installed Blender lacks OpenImageDenoise) |

All four preview images were inspected. The shield and hammer stay visually separate, the hand wraps the shaft with finger bars and an opposing thumb, the round ears and projecting muzzle read as a bear, and no pose is clipped. Evaluated geometry stays inside the frame: minimum margin at the four named poses is about 52 pixels at the bottom. Across all 25 animation frames the minimum margin is 41.11 pixels, with no clipping or geometry below ground. The ground origin is an anchor, not the bottommost foot pixel; depth projects the near toes below it.

## Limits and next review

This is a bounded modeling prototype. Rigid object joints approximate articulation; there is no deforming armature, skin weighting, walking animation, collision setup or LOD. The revised strike exposes the broad anchor face and grip; attack timing still needs a real-time game pass. Raw 64-sample renders retain some noise. Fine facial and finger details disappear at mobile scale; static 48/64/96-pixel previews were inspected, while actual in-game readability and device performance have not been measured. Nine materials and 31 batches are reported counts, not an FPS claim. No production integration has been performed.

## Review history and action revision

Astra authored the geometry and performed the Blender checks above. The coordinator's previous Opus 5.5 API review approved the initial prototype (four channels, 24-sample renders). This action revision adds a fifth rotation channel for the hammer wrist; the current GLB still contains one `polar-bear-attack` clip and 38 nodes. Blender reimport represents the five animated objects as five actions, not five independent GLB clips. Triangle, material and mesh counts are all asserted against export metadata.

The new wrist uses YXZ rotation order. At impact its X rotation cancels the combined shoulder/body X rotation, keeping the broad anchor face visible; Y rotation swings the head outward and down. Windup is raised, impact holds at source frames 11–13, recovery passes through a diagonal position at frame 17, and frame 25 closes the loop. The clip duration remains 0.8 seconds. The palm/fingers, shaft and hammer remain a single coherent rigid grip under the wrist. Geometry, materials, root, feet and camera are unchanged. GLB size increased by 620 bytes for the extra animation channel.

All four 64-sample renders were inspected against the original same-camera idle/strike previews. Idle keeps its original silhouette. Strike now shows two anchor flukes and the round brass boss on the broad face; the shaft and closed hand are exposed between the forearm and hammer. Recovery shows a diagonal head and visible grip instead of resetting instantly. Fresh GLB reimport verifies the wrist animation and full world-matrix loop closure for every object (maximum difference 0). An additional source check samples all 25 frames for bounds and ground contact.

A Chromium comparison uses the complete, uncropped canvas at 48/64/96 CSS pixels and 256px for detail. At 96px the broad face, flukes and grip connection are clearer; at 64px the weapon reads as a separate dark mass with a light tip and brass center. At 48px the weapon/body separation improves, but individual fingers and the exact anchor shape remain too small for a reliable detail claim. These are static browser observations, not mobile-device or game-performance measurements.

Before images, comparison HTML/PNG, all-frame bounds and command logs are stored outside the repository in `/workspace/.cloud-setup/evidence/arcana-model-actions-20261109/bear/`. Current preview PNGs, `.blend`, `.glb`, metadata and reimport validation remain here. The coordinator owns any model-lab integration or public asset copy.
