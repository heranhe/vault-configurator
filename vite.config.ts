import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localSource } from './tools/local-source-plugin';
import { offline, OFFLINE_OUT } from './tools/offline-plugin';

export default defineConfig(({ mode }) => ({
  plugins: [react(), localSource(), offline()],
  server: { port: 5180 },
  // 离线版（npm run build:offline）用相对路径，并把动态导入并进同一个脚本，方便内联进 HTML
  ...(mode === 'offline' && {
    base: './',
    build: { outDir: OFFLINE_OUT, emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } } },
  }),
  // 一次性预构建所有 3D 相关依赖，避免中途重新预构建产生两份 React（Invalid hook call）
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'postprocessing',
      'zustand',
      'client-zip',
    ],
  },
}));
