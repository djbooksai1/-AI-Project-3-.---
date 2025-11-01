import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // 'preview' 설정은 'vite preview' 명령어로 프로덕션 빌드를 실행할 때 적용됩니다.
  preview: {
    port: 8080,
    host: true // 👈 이 줄을 추가하세요. (컨테이너 외부 접속 허용)
  }
})