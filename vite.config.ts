import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 'server' 설정은 'vite' 개발 서버에 적용됩니다.
  // 현재 포트(기본값 5173)를 그대로 유지합니다.
  server: {
    port: 5173,
  },
  // 'preview' 설정은 'vite preview' 명령어로 프로덕션 빌드를 실행할 때 적용됩니다.
  // 프로덕션 배포 환경을 모방하기 위해 8080 포트를 사용하도록 설정합니다.
  preview: {
    port: 8080,
  }
})
