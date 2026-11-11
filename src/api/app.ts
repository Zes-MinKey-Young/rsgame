import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HttpError } from './lib/http';
import { authRoutes } from './routes/auth';
import { inviteRoutes } from './routes/invites';
import { meRoutes } from './routes/me';
import { messageRoutes, roomMessageRoutes } from './routes/messages';
import { roomRoutes } from './routes/rooms';
import { userRoutes } from './routes/users';

export function createApp() {
	const api = new Hono();

	api.use('*', async (c, next) => {
		await next();
		c.header('Cache-Control', 'no-store');
	});

	// 本地开发时前端在 5173，通过 Vite 代理访问，无需 CORS；
	// 这里保守地允许同源，防止未来独立域名部署时被浏览器拦。
	api.use('*', cors({ origin: (o) => o ?? '*', credentials: true }));

	api.route('/auth', authRoutes);
	api.route('/invites', inviteRoutes);
	api.route('/rooms', roomRoutes);
	api.route('/rooms', roomMessageRoutes);
	api.route('/messages', messageRoutes);
	api.route('/users', userRoutes);
	api.route('/me', meRoutes);

	api.get('/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

	const app = new Hono();

	app.onError((err, c) => {
		if (err instanceof HttpError) {
			return c.json({ error: err.message }, err.status);
		}
		console.error('[api] 未处理异常', err);
		return c.json({ error: '服务器内部错误' }, 500);
	});

	app.notFound((c) => c.json({ error: '接口不存在' }, 404));

	app.route('/api', api);

	return app;
}

export const app = createApp();
