import { defineConfig } from 'vite';
import path from 'path';

const currentDir = import.meta.dirname || path.resolve();

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/predict': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      },
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true
      }
    }
  },
  resolve: {
    alias: {
      'src': path.resolve(currentDir, './src'),
      'keyboard': path.resolve(currentDir, './src/keyboard'),
      'sound': path.resolve(currentDir, './src/sound'),
      'ai': path.resolve(currentDir, './src/ai'),
      'interface': path.resolve(currentDir, './src/interface'),
      'roll': path.resolve(currentDir, './src/roll'),
      'style': path.resolve(currentDir, './style'),
      'third_party': path.resolve(currentDir, './third_party')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
