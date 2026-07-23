#include <emscripten/bind.h>
#include <cmath>

// The gizmo's transform math lives here, in C++, with zero knowledge of
// Three.js or the browser. It receives rays and axes as plain floats and
// returns plain floats — only a handful cross the WebAssembly boundary.

// Closest-approach parameter along an axis line to a mouse ray.
//
// The ray  is P(s) = ro + s*rd  (camera through the mouse cursor).
// The axis is Q(t) = ao + t*ad  (ad is unit length, so t is world units).
//
// Returns t: the signed distance along the axis, measured from ao, of the
// point on the axis nearest the ray. Dragging translates by the change in t
// between pointer-down and the current frame.
double axisClosestT(double rox, double roy, double roz,
                    double rdx, double rdy, double rdz,
                    double aox, double aoy, double aoz,
                    double adx, double ady, double adz) {
  // w0 = ro - ao
  const double wx = rox - aox, wy = roy - aoy, wz = roz - aoz;

  const double a = rdx * rdx + rdy * rdy + rdz * rdz; // rd·rd
  const double b = rdx * adx + rdy * ady + rdz * adz; // rd·ad
  const double c = adx * adx + ady * ady + adz * adz; // ad·ad
  const double d = rdx * wx + rdy * wy + rdz * wz;     // rd·w0
  const double e = adx * wx + ady * wy + adz * wz;     // ad·w0

  const double denom = a * c - b * b;

  // denom ~ 0 means the ray is (nearly) parallel to the axis: the closest
  // point is ill-defined, so fall back to projecting the ray origin.
  if (std::fabs(denom) < 1e-9) {
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
double axisAngle(double rox, double roy, double roz,
                 double rdx, double rdy, double rdz,
                 double ox, double oy, double oz,
                 double nx, double ny, double nz) {
  // Ray vs. plane through o with normal n: solve for the hit distance t.
  const double denom = rdx * nx + rdy * ny + rdz * nz;
  if (std::fabs(denom) < 1e-9) {
    return NAN; // grazing the plane edge-on — no usable angle this frame
  }
  const double t = ((ox - rox) * nx + (oy - roy) * ny + (oz - roz) * nz) / denom;

  // w = hit point - center, guaranteed to lie in the rotation plane.
  const double wx = rox + t * rdx - ox;
  const double wy = roy + t * rdy - oy;
  const double wz = roz + t * rdz - oz;

  // Stable in-plane basis: cross n with whichever cardinal axis is least
  // aligned with it (avoids a degenerate cross product), then complete it.
  const double ax = std::fabs(nx), ay = std::fabs(ny), az = std::fabs(nz);
  double hx = 0, hy = 0, hz = 0;
  if (ax <= ay && ax <= az) hx = 1;
  else if (ay <= az) hy = 1;
  else hz = 1;

  double ux = hy * nz - hz * ny; // u = helper x n
  double uy = hz * nx - hx * nz;
  double uz = hx * ny - hy * nx;
  const double ul = std::sqrt(ux * ux + uy * uy + uz * uz);
  ux /= ul; uy /= ul; uz /= ul;

  const double vx = ny * uz - nz * uy; // v = n x u  (completes the frame)
  const double vy = nz * ux - nx * uz;
  const double vz = nx * uy - ny * ux;

  return std::atan2(wx * vx + wy * vy + wz * vz, wx * ux + wy * uy + wz * uz);
}

EMSCRIPTEN_BINDINGS(core) {
  emscripten::function("axisClosestT", &axisClosestT);
  emscripten::function("axisAngle", &axisAngle);
}
