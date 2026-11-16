import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // 실행 환경이 PORT를 지정하면 그 포트로 띄운다.
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
});
