import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// FIX: Import 'cwd' from 'node:process' to avoid reliance on global types which were not being found.
import { cwd } from 'node:process';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // FIX: Use the imported `cwd` function instead of `process.cwd()` to resolve the typing error.
  const env = loadEnv(mode, cwd(), '');
  return {
    // vite config
    define: {
      'process.env': env
    },
    plugins: [react()],
    server: {
      port: 5173,
      // DEV: Allow connections from the AI Studio proxy by listening on all network interfaces.
      host: true,
    },
    // 'preview' 설정은 'vite preview' 명령어로 프로덕션 빌드를 실행할 때 적용됩니다.
    preview: {
      port: 8080,
      host: true,
    }
  }
})