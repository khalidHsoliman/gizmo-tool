import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { axisClosestT, axisAngle } from './core.ts';

type V3 = readonly [number, number, number];

const EPS = 1e-9;
const close = (actual: number, expected: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) < EPS, msg ?? `expected ${expected}, got ${actual}`);

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];
const ORIGIN: V3 = [0, 0, 0];

const closestT = (ro: V3, rd: V3, ao: V3, ad: V3) =>
  axisClosestT(...ro, ...rd, ...ao, ...ad);

const angle = (ro: V3, rd: V3, o: V3, n: V3) =>
  axisAngle(...ro, ...rd, ...o, ...n);

// Difference b - a wrapped into (-pi, pi], the same unwrap main.ts applies.
const wrapDiff = (b: number, a: number) => {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

// Angle of the ray from `from` through `hit` (a point on the rotation plane).
const angleThrough = (from: V3, hit: V3, o: V3, n: V3) =>
  angle(from, [hit[0] - from[0], hit[1] - from[1], hit[2] - from[2]], o, n);

describe('axisClosestT', () => {
  it('returns the axis coordinate under a ray perpendicular to the axis', () => {
    // Looking straight down -Z at x = 2: the nearest point on the X axis is x = 2.
    close(closestT([2, 0, 5], [0, 0, -1], ORIGIN, X), 2);
    close(closestT([-3.5, 0, 5], [0, 0, -1], ORIGIN, X), -3.5);
  });

  it('measures t from the axis origin', () => {
    close(closestT([2, 0, 5], [0, 0, -1], [0.5, 0, 0], X), 1.5);
    close(closestT([1, 4, -2], [-1, 0, 0], [0, 1, 0], Y), 3);
  });

  it('handles an oblique ray that crosses the axis', () => {
    // From (0, 3, 0) heading down-right at 45°, the ray meets the X axis at x = 3.
    close(closestT([0, 3, 0], [1, -1, 0], ORIGIN, X), 3);
  });

  it('handles skew lines (ray never touches the axis)', () => {
    // Ray runs along +Y at x = 4, z = 5; the closest X-axis point is x = 4.
    close(closestT([4, 0, 5], [0, 1, 0], ORIGIN, X), 4);
    close(closestT([0, -1, 7], [1, 0, 0], ORIGIN, Z), 7);
  });

  it('does not depend on the ray direction length', () => {
    const unit = closestT([0, 3, 0], [Math.SQRT1_2, -Math.SQRT1_2, 0], ORIGIN, X);
    const long = closestT([0, 3, 0], [10, -10, 0], ORIGIN, X);
    close(unit, 3);
    close(long, 3);
  });

  describe('parallel-ray fallback', () => {
    it('projects the ray origin onto the axis when the ray is parallel', () => {
      close(closestT([7, 2, 3], [1, 0, 0], ORIGIN, X), 7);
      close(closestT([7, 2, 3], [1, 0, 0], [1, 0, 0], X), 6);
    });

    it('also applies to an anti-parallel ray', () => {
      close(closestT([7, 2, 3], [-2, 0, 0], ORIGIN, X), 7);
    });

    it('kicks in for a nearly parallel ray instead of blowing up', () => {
      // denom = 1e-12 here; without the fallback the result would be ~ -2e6.
      const t = closestT([7, 2, 3], [1, 1e-6, 0], ORIGIN, X);
      assert.ok(Number.isFinite(t));
      close(t, 7);
    });
  });
});

describe('axisAngle', () => {
  const above: V3 = [0.3, -0.2, 5]; // a camera position off the Z axis, above the XY plane

  it('gives known angles for the Z axis basis (u = -Y, v = +X)', () => {
    close(angleThrough(above, [0, -1, 0], ORIGIN, Z), 0);
    close(angleThrough(above, [1, 0, 0], ORIGIN, Z), Math.PI / 2);
    close(angleThrough(above, [0, 1, 0], ORIGIN, Z), Math.PI);
    close(angleThrough(above, [-1, 0, 0], ORIGIN, Z), -Math.PI / 2);
    close(angleThrough(above, [1, -1, 0], ORIGIN, Z), Math.PI / 4);
  });

  it('gives known angles for the X and Y axes', () => {
    // X axis: u = -Z, v = +Y.
    close(angleThrough([5, 1, 1], [0, 0, -1], ORIGIN, X), 0);
    close(angleThrough([5, 1, 1], [0, 1, 0], ORIGIN, X), Math.PI / 2);
    // Y axis: u = +Z, v = +X.
    close(angleThrough([1, 5, 1], [0, 0, 1], ORIGIN, Y), 0);
    close(angleThrough([1, 5, 1], [1, 0, 0], ORIGIN, Y), Math.PI / 2);
  });

  it('measures around the center o, not the world origin', () => {
    const o: V3 = [2, -1, 3];
    close(angleThrough([2, -1, 9], [2, -2, 3], o, Z), 0);
    close(angleThrough([2, -1, 9], [3, -1, 3], o, Z), Math.PI / 2);
  });

  it('ignores the distance of the hit point from the center', () => {
    close(angleThrough(above, [0.001, 0, 0], ORIGIN, Z), Math.PI / 2);
    close(angleThrough(above, [250, 0, 0], ORIGIN, Z), Math.PI / 2);
  });

  it('gives the same angle whichever side of the plane the ray comes from', () => {
    const below: V3 = [0.3, -0.2, -5];
    close(angleThrough(below, [1, 1, 0], ORIGIN, Z), angleThrough(above, [1, 1, 0], ORIGIN, Z));
  });

  it('turns counter-clockwise about n', () => {
    // Each quarter turn about +Z (x -> y) adds +pi/2. The first one crosses
    // the ±pi seam (raw angles ~1.77 -> ~-2.94), so it only holds once unwrapped.
    const a0 = angleThrough(above, [1, 0.2, 0], ORIGIN, Z);
    const a1 = angleThrough(above, [-0.2, 1, 0], ORIGIN, Z);
    close(wrapDiff(a1, a0), Math.PI / 2);
    const a2 = angleThrough(above, [-1, -0.2, 0], ORIGIN, Z);
    close(wrapDiff(a2, a1), Math.PI / 2);
  });

  it('works for a non-cardinal axis', () => {
    const n: V3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
    // Two points in the plane x+y+z = 0, a quarter turn apart about n.
    const p: V3 = [1 / Math.SQRT2, -1 / Math.SQRT2, 0];
    const q: V3 = [ // n x p
      n[1] * p[2] - n[2] * p[1],
      n[2] * p[0] - n[0] * p[2],
      n[0] * p[1] - n[1] * p[0],
    ];
    const from: V3 = [3, 4, 5];
    const a0 = angleThrough(from, p, ORIGIN, n);
    const a1 = angleThrough(from, q, ORIGIN, n);
    close(wrapDiff(a1, a0), Math.PI / 2);
  });

  describe('ray parallel to the plane', () => {
    it('returns NaN when the ray lies along the plane', () => {
      assert.ok(Number.isNaN(angle([0, 0, 5], [1, 0, 0], ORIGIN, Z)));
      assert.ok(Number.isNaN(angle([0, 0, 0], [0, 1, 0], ORIGIN, Z))); // in the plane itself
      assert.ok(Number.isNaN(angle([5, 0, 0], [0, 3, -4], ORIGIN, X)));
    });

    it('returns NaN within the 1e-9 tolerance', () => {
      assert.ok(Number.isNaN(angle([0, 0, 5], [1, 0, 1e-10], ORIGIN, Z)));
    });

    it('still returns a number just outside the tolerance', () => {
      assert.ok(!Number.isNaN(angle([0, 0, 5], [1, 0, -1e-6], ORIGIN, Z)));
    });
  });

  describe('range', () => {
    const inRange = (a: number) => a > -Math.PI && a <= Math.PI;

    it('returns exactly +pi (not -pi) on the seam', () => {
      const a = angleThrough([0, 1, 5], [0, 1, 0], ORIGIN, Z);
      assert.equal(a, Math.PI);
    });

    it('returns +pi, not -pi, when rounding lands a hair past the seam', () => {
      // For this axis and hit point the in-plane v-component comes out as
      // ~ -1.7e-16 instead of 0, and atan2 of that alone rounds to exactly -pi.
      const s = 1 / Math.sqrt(3);
      const n: V3 = [s, -s, s];
      const hit: V3 = [-0, Math.SQRT1_2, Math.SQRT1_2];
      const from: V3 = [n[0] * 4 + 0.7, n[1] * 4 - 0.3, n[2] * 4 + 0.2];
      assert.equal(angleThrough(from, hit, ORIGIN, n), Math.PI);
    });

    it('stays in (-pi, pi] for a full sweep around each axis', () => {
      const axes: V3[] = [X, Y, Z, [0.6, 0, 0.8], [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)]];
      for (const n of axes) {
        const from: V3 = [n[0] * 4 + 0.7, n[1] * 4 - 0.3, n[2] * 4 + 0.2];
        const ref: V3 = Math.abs(n[0]) < 0.9 ? X : Y;
        // Two orthonormal in-plane directions, built independently of core.ts.
        let e1: V3 = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
        const l = Math.hypot(...e1);
        e1 = [e1[0] / l, e1[1] / l, e1[2] / l];
        const e2: V3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
        for (let i = 0; i <= 720; i++) {
          const th = (i / 720) * 2 * Math.PI;
          const hit: V3 = [
            Math.cos(th) * e1[0] + Math.sin(th) * e2[0],
            Math.cos(th) * e1[1] + Math.sin(th) * e2[1],
            Math.cos(th) * e1[2] + Math.sin(th) * e2[2],
          ];
          const a = angleThrough(from, hit, ORIGIN, n);
          assert.ok(inRange(a), `angle ${a} out of range for n=${n}, step ${i}`);
        }
      }
    });

    it('stays in (-pi, pi] for random rays', () => {
      // Small deterministic PRNG (mulberry32) so failures are reproducible.
      let seed = 0x9e3779b9;
      const rand = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const r = () => rand() * 20 - 10;
      let checked = 0;
      for (let i = 0; i < 10000; i++) {
        const nRaw: V3 = [r(), r(), r()];
        const nl = Math.hypot(...nRaw);
        const n: V3 = [nRaw[0] / nl, nRaw[1] / nl, nRaw[2] / nl];
        const a = angle([r(), r(), r()], [r(), r(), r()], [r(), r(), r()], n);
        if (Number.isNaN(a)) continue;
        assert.ok(inRange(a), `angle ${a} out of range at iteration ${i}`);
        checked++;
      }
      assert.ok(checked > 9000);
    });
  });
});
