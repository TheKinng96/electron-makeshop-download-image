import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [],
  css: {
    postcss: './postcss.config.js',
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
});
