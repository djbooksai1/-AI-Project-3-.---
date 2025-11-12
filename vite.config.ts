import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath, URL } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // FIX: `__dirname` is not available in ES modules. Using `import.meta.url` to get the correct path.
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // DEV: Allow connections from the AI Studio proxy by listening on all network interfaces.
    host: true,
  },
  // 'preview' 설정은 'vite preview' 명령어로 프로덕션 빌드를 실행할 때 적용됩니다.
  preview: {
    port: 8080,
    host: true,
    allowedHosts: ['.a.run.app'] // <--- 이 줄을 추가하세요
  }
})