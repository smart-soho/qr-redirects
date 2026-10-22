import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { rollupOptions: { input: { main: resolve('index.html'), admin: resolve('admin/index.html') } } } });
