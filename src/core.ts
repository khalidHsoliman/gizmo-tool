// The gizmo's transform math lives here, in plain TypeScript, with zero
// knowledge of Three.js or the browser. It receives rays and axes as plain
// numbers and returns plain numbers — nothing else crosses into this module.

// Closest-approach parameter along an axis line to a mouse ray.
//
// The ray  is P(s) = ro + s*rd  (camera through the mouse cursor).
// The axis is Q(t) = ao + t*ad  (ad is unit length, so t is world units).
//
// Returns t: the signed distance along the axis, measured from ao, of the
// point on the axis nearest the ray. Dragging translates by the change in t
// between pointer-down and the current frame.
export function axisClosestT(rox: number, roy: number, roz: number,
                             rdx: number, rdy: number, rdz: number,
                             aox: number, aoy: number, aoz: number,
                             adx: number, ady: number, adz: number): number {
  // w0 = ro - ao
  const wx = rox - aox, wy = roy - aoy, wz = roz - aoz;

  const a = rdx * rdx + rdy * rdy + rdz * rdz; // rd·rd
  const b = rdx * adx + rdy * ady + rdz * adz; // rd·ad
  const c = adx * adx + ady * ady + adz * adz; // ad·ad
  const d = rdx * wx + rdy * wy + rdz * wz;     // rd·w0
  const e = adx * wx + ady * wy + adz * wz;     // ad·w0

  const denom = a * c - b * b;

  // denom ~ 0 means the ray is (nearly) parallel to the axis: the closest
  // point is ill-defined, so fall back to projecting the ray origin.
  if (Math.abs(denom) < 1e-9) {
    return e / c;
  }
  return (a * e - b * d) / denom;
}

// Angle of the mouse ray around a rotation axis.
//
// Rotating about an axis happens in the plane perpendicular to it, passing
// through the object's center `o`. We intersect the mouse ray with that plane,
// then measure the angle of the hit point around the axis. Dragging rotates by
// the change in this angle between frames.
//
// The angle is measured in a basis (u, v) derived deterministically from the
// axis normal `n`, so the same ray+axis always yields the same angle — which is
// what makes the frame-to-frame difference meaningful. Returns radians in
// (-pi, pi], or NaN if the ray is parallel to the plane (angle undefined).
export function axisAngle(rox: number, roy: number, roz: number,
                          rdx: number, rdy: number, rdz: number,
                          ox: number, oy: number, oz: number,
                          nx: number, ny: number, nz: number): number {
  // Ray vs. plane through o with normal n: solve for the hit distance t.
  const denom = rdx * nx + rdy * ny + rdz * nz;
  if (Math.abs(denom) < 1e-9) {
    return NaN; // grazing the plane edge-on — no usable angle this frame
  }
  const t = ((ox - rox) * nx + (oy - roy) * ny + (oz - roz) * nz) / denom;

  // w = hit point - center, guaranteed to lie in the rotation plane.
  const wx = rox + t * rdx - ox;
  const wy = roy + t * rdy - oy;
  const wz = roz + t * rdz - oz;

  // Stable in-plane basis: cross n with whichever cardinal axis is least
  // aligned with it (avoids a degenerate cross product), then complete it.
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  let hx = 0, hy = 0, hz = 0;
  if (ax <= ay && ax <= az) hx = 1;
  else if (ay <= az) hy = 1;
  else hz = 1;

  let ux = hy * nz - hz * ny; // u = helper x n
  let uy = hz * nx - hx * nz;
  let uz = hx * ny - hy * nx;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= ul; uy /= ul; uz /= ul;

  const vx = ny * uz - nz * uy; // v = n x u  (completes the frame)
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  const y = wx * vx + wy * vy + wz * vz;
  const x = wx * ux + wy * uy + wz * uz;
  // On the seam (x < 0, y ~ 0) atan2 returns -pi for y = -0 or for a tiny
  // negative y left over from rounding. -pi and +pi are the same direction, so
  // report +pi to keep the result in (-pi, pi].
  const angle = Math.atan2(y, x);
  return angle === -Math.PI ? Math.PI : angle;
}
