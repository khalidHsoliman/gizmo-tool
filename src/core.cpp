#include <emscripten/bind.h>

// First logic living in C++: compute the cube's spin angle.
// Trivial for now — its job is to prove the C++ -> WASM -> JS pipeline.
// The real gizmo transform math will replace this later.
double spin(double t) {
  return t * 0.6;
}

EMSCRIPTEN_BINDINGS(core) {
  emscripten::function("spin", &spin);
}
