import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

function entryPoints(mode:string):Record<string,string>{
  const inputs:Record<string,string>={
    arcana:fileURLToPath(new URL('./index.html',import.meta.url)),
    frontier:fileURLToPath(new URL('./frontier.html',import.meta.url)),
  };
  if(mode!=='mobile'){
    inputs.arcade=fileURLToPath(new URL('./arcade.html',import.meta.url));
    inputs.models=fileURLToPath(new URL('./model-lab.html',import.meta.url));
  }
  return inputs;
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: mode === 'mobile' ? 'dist-mobile' : 'dist',
    rollupOptions: {
      input: entryPoints(mode),
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
        fileURLToPath(new URL('.', import.meta.url)),
      ],
    },
  },
}));
