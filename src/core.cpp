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

EMSCRIPTEN_BINDINGS(core) {
  emscripten::function("axisClosestT", &axisClosestT);
}
