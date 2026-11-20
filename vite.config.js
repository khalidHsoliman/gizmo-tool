import { defineConfig } from 'vite';

export default defineConfig({
    base: '/gizmo-tool/',
    build: {
        // The bundle is ~550 kB, almost all of it Three.js. Splitting it out
        // wouldn't help (Three.js alone is over Vite's 500 kB default), so set
        // the limit just above the current size; growth past it still warns.
        chunkSizeWarningLimit: 600,
    },
});