/**
 * 本地开发用的 Hono 服务器，替代 netlify dev。
 * 用法：bun run dev:api（Vite 会把 /api 代理到这里）
 */
import { app } from './api/app';

const port = Number(process.env.API_PORT ?? 8787);

console.log(`[dev] API 服务启动: http://127.0.0.1:${port}`);

export default {
	port,
	fetch: app.fetch
};
