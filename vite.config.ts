import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localSource } from './tools/local-source-plugin';

export default defineConfig({
  plugins: [react(), localSource()],
  server: { port: 5180 },
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
});
