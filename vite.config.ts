import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  // GitHub Actions 환경에서 GITHUB_REPOSITORY는 "owner/repo" 형식
  // 저장소 이름이 바뀌어도 자동으로 base 경로를 맞춰줍니다
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const base = process.env.GITHUB_PAGES
    ? (repoName ? `/${repoName}/` : '/elosorter/')
    : '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
  };
});
