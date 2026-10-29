/* Stylized, texture-free units for the standalone Arcana renderer.
 * Every model is one cached vertex-colored BufferGeometry: front +Z, feet y=0.
 * Geometry has no simulation, DOM, renderer, texture, or network dependencies. */
(function (root) {
  'use strict';

  root.ArcanaModels = {
    create({ THREE, Batch, M4, col, VIS }) {
      const enemyCache = new Map(), towerCache = new Map();
      const C = value => value && value.isColor ? value.clone() : col(value);
      const INK = '#263253', IVORY = '#fff2d5', GOLD = '#f5c764';

      function sculpt() {
        const b = new Batch();
        const add = (g, x, y, z, color, bake = true) => {
          const c = C(color);
          b.add(g, M4(x, y, z), c, c, 0, { bake });
        };
        return {
          b,
          box(w, h, d, x, y, z, c, tilt = 0) {
            add(new THREE.BoxGeometry(w, h, d).rotateZ(tilt), x, y, z, c);
          },
          oval(rx, ry, rz, x, y, z, c) {
            add(new THREE.IcosahedronGeometry(1, 0).scale(rx, ry, rz), x, y, z, c);
          },
          gem(rx, ry, rz, x, y, z, c, tilt = 0) {
            add(new THREE.OctahedronGeometry(1, 0).scale(rx, ry, rz).rotateZ(tilt), x, y, z, c);
          },
          cone(r, h, n, x, y, z, c, tilt = 0) {
            add(new THREE.ConeGeometry(r, h, n).rotateZ(tilt), x, y, z, c);
          },
          cylinder(rt, rb, h, n, x, y, z, c, open = false) {
            add(new THREE.CylinderGeometry(rt, rb, h, n, 1, open), x, y, z, c);
          },
          rod(a, end, radius, c) {
            const start = new THREE.Vector3(...a), finish = new THREE.Vector3(...end);
            const direction = finish.clone().sub(start), midpoint = start.clone().add(finish).multiplyScalar(0.5);
            const g = new THREE.CylinderGeometry(radius, radius, direction.length(), 4);
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
            add(g, midpoint.x, midpoint.y, midpoint.z, c);
          },
          wing(points, depth, x, y, z, c) {
            const shape = new THREE.Shape();
            points.forEach(([px, py], i) => i ? shape.lineTo(px, py) : shape.moveTo(px, py));
            shape.closePath();
            const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
            g.translate(0, 0, -depth / 2);
            add(g, x, y, z, c);
          },
          mark(w, h, x, y, z, color, tilt = 0) {
            // Flat facial/rune inlays stay crisp with the unlit vertex material.
            add(new THREE.PlaneGeometry(w, h).rotateZ(tilt), x, y, z, color, false);
          },
        };
      }

      function finish(s, height, radius, name) {
        const g = s.b.build(), p = g.getAttribute('position');
        let low = Infinity, high = -Infinity, widest = 0;
        for (let i = 0; i < p.count; i++) {
          low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i));
          widest = Math.max(widest, Math.hypot(p.getX(i), p.getZ(i)));
        }
        // Keep all equipment inside the original targeting/occlusion envelope.
        for (let i = 0; i < p.count; i++) p.setXYZ(i,
          p.getX(i) * radius / widest,
          (p.getY(i) - low) * height / (high - low),
          p.getZ(i) * radius / widest);
        p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
        g.name = name;
        g.userData.arcanaModel = { triangles: p.count / 3, height, radius, front: '+Z' };
        return g;
      }

      function eyes(s, spread, y, z, w, h, tilt = 0) {
        [-1, 1].forEach(side => s.mark(w, h, side * spread, y, z, INK, side * tilt));
      }

      function towerGeo(type, level) {
        const lv = Math.max(1, Math.min(4, Math.trunc(level) || 1));
        if (!Object.prototype.hasOwnProperty.call(VIS.card, type)) type = 'wand';
        const key = type + ':' + lv;
        if (towerCache.has(key)) return towerCache.get(key);
        const s = sculpt(), color = VIS.card[type][0], light = VIS.card[type][1];
        const skin = '#f7d5b5';
        [-1, 1].forEach(side => s.box(0.28, 0.10, 0.37, side * 0.24, 0.05, 0.10, INK));

        if (type === 'wand') {
          // Amber pointed hat, violet split robe, visible face, fire-crystal staff.
          s.cylinder(0.28, 0.60, 0.43, 6, 0, 0.30, -0.03, '#66519b');
          s.mark(0.15, 0.32, 0, 0.30, 0.43, color);
          s.oval(0.37, 0.14, 0.35, 0, 0.61, 0.05, skin);
          eyes(s, 0.11, 0.63, 0.36, 0.065, 0.045);
          s.cone(0.17, 0.18, 4, 0, 0.49, 0.34, IVORY);
          s.cylinder(0.66, 0.67, 0.035, 8, 0, 0.73, 0, color);
          s.cone(0.48, 0.27, 6, 0.055, 0.875, -0.035, color, -0.16);
          s.box(0.24, 0.24, 0.26, -0.47, 0.43, 0, '#66519b', -0.35);
          s.box(0.24, 0.22, 0.26, 0.48, 0.43, 0.04, '#66519b', 0.55);
          s.gem(0.15, 0.07, 0.13, 0.65, 0.39, 0.10, skin);
          s.cylinder(0.035, 0.035, 0.73, 4, 0.77, 0.465, 0.10, '#a96d41');
          s.gem(0.16, 0.105, 0.16, 0.77, 0.91, 0.10, '#ffb85c');
          if (lv >= 2) s.cylinder(0.34, 0.39, 0.07, 6, 0, 0.48, -0.03, GOLD);
          if (lv >= 3) {
            s.cylinder(0.45, 0.49, 0.045, 6, 0, 0.755, -0.015, '#fff0bc');
            s.gem(0.10, 0.055, 0.045, 0, 0.45, 0.40, '#ff9654');
          }
          if (lv >= 4) {
            [-1, 1].forEach(side => s.gem(0.23, 0.085, 0.24, side * 0.44, 0.52, 0, GOLD));
            s.gem(0.08, 0.055, 0.045, 0, 0.84, 0.30, IVORY);
          }
        } else if (type === 'cup') {
          // White/blue cleric with a three-point water crown and a large held orb.
          s.cylinder(0.25, 0.57, 0.44, 6, 0, 0.31, -0.04, '#e8f4ed');
          s.mark(0.20, 0.34, 0, 0.31, 0.43, color);
          s.cylinder(0.30, 0.60, 0.14, 6, 0, 0.52, -0.07, color);
          s.oval(0.45, 0.19, 0.39, 0, 0.735, -0.05, color);
          s.oval(0.32, 0.14, 0.24, 0, 0.72, 0.20, skin);
          eyes(s, 0.10, 0.745, 0.415, 0.06, 0.04);
          [-1, 0, 1].forEach(k => s.gem(0.11, k ? 0.09 : 0.13, 0.12, k * 0.25, 0.91, 0, light, -k * 0.35));
          s.box(0.25, 0.22, 0.26, -0.46, 0.43, 0.05, '#e8f4ed', -0.45);
          s.box(0.22, 0.25, 0.24, 0.45, 0.42, 0.03, '#e8f4ed', 0.3);
          s.gem(0.16, 0.075, 0.15, -0.61, 0.40, 0.18, skin);
          s.oval(0.29, 0.15, 0.29, -0.63, 0.59, 0.20, '#9ee9ff');
          s.gem(0.10, 0.055, 0.05, -0.64, 0.635, 0.44, '#f4ffff');
          if (lv >= 2) s.cylinder(0.34, 0.38, 0.055, 6, 0, 0.46, -0.04, GOLD);
          if (lv >= 3) [-1, 1].forEach(side => s.gem(0.23, 0.09, 0.24, side * 0.43, 0.56, -0.04, light));
          if (lv >= 4) {
            s.gem(0.13, 0.075, 0.06, 0, 0.54, 0.43, '#baffef');
            s.gem(0.08, 0.08, 0.08, -0.63, 0.81, 0.20, '#d7fbff');
          }
        } else if (type === 'sword') {
          // A chibi knight: pale cuirass, dark visor, kite shield and upright blade.
          s.box(0.62, 0.36, 0.48, 0, 0.32, -0.02, '#d8e5ec');
          s.box(0.48, 0.07, 0.51, 0, 0.20, 0, INK);
          s.oval(0.39, 0.17, 0.38, 0, 0.72, 0, '#e8edf1');
          s.box(0.56, 0.065, 0.06, 0, 0.73, 0.32, INK);
          [-1, 1].forEach(side => s.mark(0.065, 0.025, side * 0.12, 0.73, 0.355, '#bfeaff'));
          s.box(0.09, 0.22, 0.08, 0, 0.71, 0.35, '#c2d5e1');
          s.box(0.22, 0.26, 0.25, -0.43, 0.43, -0.01, INK, -0.25);
          s.box(0.22, 0.26, 0.25, 0.43, 0.43, -0.01, INK, 0.25);
          s.gem(0.35, 0.26, 0.09, -0.48, 0.39, 0.39, GOLD);
          s.gem(0.27, 0.20, 0.06, -0.48, 0.40, 0.46, '#427ca5');
          s.mark(0.055, 0.20, -0.48, 0.41, 0.525, IVORY);
          s.cylinder(0.045, 0.045, 0.20, 4, 0.68, 0.34, 0.13, '#8b634e');
          s.box(0.30, 0.045, 0.09, 0.68, 0.44, 0.13, GOLD);
          s.gem(0.09, 0.28, 0.045, 0.68, 0.73, 0.13, '#f1f8ff');
          s.gem(0.13, 0.12, 0.18, 0, 0.92, -0.02, '#d76d65');
          if (lv >= 2) [-1, 1].forEach(side => s.gem(0.27, 0.105, 0.29, side * 0.42, 0.53, -0.02, GOLD));
          if (lv >= 3) s.gem(0.12, 0.095, 0.05, 0, 0.38, 0.27, GOLD);
          if (lv >= 4) {
            s.gem(0.13, 0.16, 0.15, 0, 0.88, -0.23, '#e38d7c', -0.28);
            s.gem(0.09, 0.07, 0.045, -0.48, 0.41, 0.54, '#e6fafc');
          }
        } else {
          // Mossy stone druid: squared stone face, oak antlers and a leafy mantle.
          s.cylinder(0.32, 0.54, 0.38, 5, 0, 0.30, -0.03, '#c3cebb');
          s.box(0.65, 0.24, 0.50, 0, 0.64, 0, '#e4dcc7');
          s.box(0.45, 0.11, 0.06, 0, 0.64, 0.27, '#c5c6b0');
          eyes(s, 0.13, 0.66, 0.31, 0.08, 0.035);
          s.cone(0.20, 0.17, 4, 0, 0.47, 0.27, '#d9e5d0');
          [-1, 1].forEach(side => {
            s.box(0.28, 0.27, 0.33, side * 0.48, 0.38, 0.01, '#acbdab', side * 0.17);
            s.rod([side * 0.23, 0.74, -0.05], [side * 0.51, 0.98, -0.11], 0.045, '#b39467');
            s.rod([side * 0.38, 0.87, -0.08], [side * 0.70, 0.89, -0.12], 0.035, '#b39467');
            s.gem(0.20, 0.10, 0.12, side * 0.57, 0.92, -0.12, '#b9d990', side * 0.5);
            s.gem(0.34, 0.13, 0.24, side * 0.32, 0.50, 0.01, '#6c9e69', side * 0.35);
          });
          s.gem(0.14, 0.10, 0.06, 0, 0.35, 0.43, GOLD);
          if (lv >= 2) [-1, 1].forEach(side => s.gem(0.22, 0.13, 0.10, side * 0.20, 0.25, 0.36, '#92b77c', side * 0.4));
          if (lv >= 3) s.gem(0.16, 0.10, 0.05, 0, 0.77, 0.14, GOLD);
          if (lv >= 4) [-1, 1].forEach(side => s.gem(0.13, 0.08, 0.13, side * 0.58, 0.51, 0.08, '#e7dfbb'));
        }
        const g = finish(s, VIS.tower.h[lv - 1], VIS.tower.r[lv - 1], `guardian-${type}-lv${lv}`);
        towerCache.set(key, g); return g;
      }

      function enemyGeo(type) {
        const t = Math.max(0, Math.min(3, Math.trunc(type) || 0));
        if (enemyCache.has(t)) return enemyCache.get(t);
        const s = sculpt(), pale = C(VIS.enemy.color[t]).lerp(col('#ffffff'), 0.16);
        if (t === 0) {
          // Little mist imp: large ears, round mask, short legs and a crooked tuft.
          s.oval(0.73, 0.31, 0.58, 0, 0.37, -0.02, pale);
          s.oval(0.66, 0.31, 0.57, 0, 0.65, 0.06, pale);
          s.oval(0.48, 0.20, 0.16, 0, 0.64, 0.47, '#f1edf7');
          [-1, 1].forEach(side => {
            s.cone(0.23, 0.33, 4, side * 0.61, 0.76, -0.01, '#b9b8e3', -side * 0.6);
            s.gem(0.22, 0.16, 0.24, side * 0.65, 0.33, 0.02, pale);
            s.gem(0.27, 0.10, 0.34, side * 0.30, 0.10, 0.16, '#c1bddb');
          });
          s.cone(0.16, 0.24, 4, -0.07, 0.94, -0.06, pale, -0.3);
          eyes(s, 0.16, 0.67, 0.615, 0.105, 0.08, 0.12);
          s.mark(0.11, 0.035, 0, 0.53, 0.60, INK);
        } else if (t === 1) {
          // Swift winged whisper: swept wings and two tails, visibly slimmer.
          s.gem(0.35, 0.34, 0.42, 0, 0.41, 0.01, pale);
          s.oval(0.42, 0.20, 0.40, 0, 0.72, 0.07, '#dfdef6');
          [-1, 1].forEach(side => {
            const points = [[0, 0], [side * 0.72, 0.24], [side * 0.57, -0.18], [side * 0.20, -0.12]];
            if (side > 0) points.reverse();
            s.wing(points, 0.10, side * 0.18, 0.57, -0.09, '#abb9e0');
            s.gem(0.30, 0.045, 0.06, side * 0.49, 0.62, -0.025, '#e3d6fc', side * 0.35);
            s.cone(0.12, 0.24, 4, side * 0.28, 0.90, -0.02, pale, -side * 0.25);
            s.cone(0.11, 0.30, 4, side * 0.15, 0.15, -0.12, pale, Math.PI + side * 0.18);
          });
          eyes(s, 0.13, 0.74, 0.41, 0.09, 0.055, -0.18);
        } else if (t === 2) {
          // Wide armored stone brute, huge square gauntlets and a slit helmet.
          s.box(1.13, 0.43, 0.83, 0, 0.45, -0.02, pale);
          s.box(0.84, 0.32, 0.06, 0, 0.49, 0.43, '#dde1ed');
          s.cylinder(0.47, 0.48, 0.31, 6, 0, 0.79, 0, '#c5cfe4');
          s.box(0.61, 0.065, 0.055, 0, 0.80, 0.43, INK);
          [-1, 1].forEach(side => {
            s.gem(0.29, 0.18, 0.40, side * 0.58, 0.63, 0, '#d9dfef');
            s.box(0.32, 0.35, 0.39, side * 0.67, 0.35, 0.06, pale);
            s.box(0.38, 0.16, 0.52, side * 0.31, 0.08, 0.14, '#b5bbd0');
            s.gem(0.075, 0.055, 0.04, side * 0.31, 0.58, 0.48, '#f3e1ad');
            s.mark(0.09, 0.035, side * 0.15, 0.80, 0.46, '#e7f8ff');
          });
          s.gem(0.13, 0.13, 0.05, 0, 0.43, 0.49, '#f1effb');
        } else {
          // The Mist King: horned crown, oversized pauldrons and sweeping cape.
          s.wing([[-0.64, 0.68], [-0.83, 0.12], [0, 0], [0.83, 0.12], [0.64, 0.68]], 0.13, 0, 0.12, -0.35, '#81749f');
          s.oval(0.64, 0.31, 0.50, 0, 0.44, 0.01, pale);
          s.oval(0.45, 0.20, 0.42, 0, 0.75, 0.07, '#e0d9ef');
          s.gem(0.44, 0.24, 0.10, 0, 0.47, 0.47, '#dcd5ec');
          s.gem(0.16, 0.12, 0.07, 0, 0.48, 0.56, '#f3d28b');
          [-1, 1].forEach(side => {
            s.gem(0.36, 0.19, 0.42, side * 0.60, 0.62, -0.01, '#d0cce5');
            s.box(0.28, 0.34, 0.37, side * 0.67, 0.36, 0.05, '#b7b4d0');
            s.gem(0.22, 0.11, 0.30, side * 0.67, 0.22, 0.17, '#e5deeb');
            s.box(0.36, 0.14, 0.50, side * 0.31, 0.07, 0.16, '#bcb4cd');
            s.cone(0.13, 0.25, 4, side * 0.43, 0.85, -0.08, '#ece3c5', -side * 0.55);
          });
          s.cylinder(0.43, 0.43, 0.07, 8, 0, 0.89, 0.02, GOLD, true);
          [-1, 0, 1].forEach(k => s.cone(0.10, k ? 0.16 : 0.21, 4, k * 0.29, 0.98, 0.10, GOLD));
          eyes(s, 0.15, 0.77, 0.43, 0.11, 0.07, -0.15);
          s.mark(0.18, 0.035, 0, 0.65, 0.43, INK);
        }
        const height = [0.50, 0.565, 0.54, 1.94][t];
        const g = finish(s, height, VIS.enemy.size[t] / 2, `monster-${t}`);
        enemyCache.set(t, g); return g;
      }

      return { enemyGeo, towerGeo };
    },
  };
}(typeof window === 'undefined' ? globalThis : window));
