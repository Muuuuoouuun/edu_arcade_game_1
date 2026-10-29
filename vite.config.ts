import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        arcade: new URL('./index.html', import.meta.url).pathname,
        models: new URL('./model-lab.html', import.meta.url).pathname,
      },
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/three/')) return;
          if (id.includes('/build/three.core')) return 'three-core';
          if (id.includes('/examples/')) return 'three-tools';
          return 'three-renderer';
        },
      },
    },
  },
  server: {
    fs: {
      allow: [
        new URL('.', import.meta.url).pathname,
        new URL('../math_speed/functions/src', import.meta.url).pathname,
      ],
    },
  },
});
