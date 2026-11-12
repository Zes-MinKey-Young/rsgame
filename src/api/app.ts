import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DatabaseNotConfiguredError, connectionString, pingDatabase } from '../db';
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

	/**
	 * 健康检查 / 部署自检。
	 * 默认只报告配置是否存在（不泄露任何值）；`?deep=1` 会真正连一次数据库。
	 */
	api.get('/health', async (c) => {
		const result: Record<string, unknown> = {
			ok: true,
			time: new Date().toISOString(),
			database: connectionString() ? 'configured' : 'missing',
			jwt: process.env.JWT_SECRET ? 'configured' : 'missing'
		};

		if (c.req.query('deep') === '1' && connectionString()) {
			try {
				await pingDatabase();
				result.dbPing = 'ok';
			} catch (err) {
				result.dbPing = `error: ${(err as Error).message}`;
			}
		}

		return c.json(result);
	});

	const app = new Hono();

	app.onError((err, c) => {
		if (err instanceof HttpError) {
			return c.json({ error: err.message }, err.status);
		}
		if (err instanceof DatabaseNotConfiguredError) {
			console.error('[api]', err.message);
			return c.json({ error: err.message }, 500);
		}
		console.error('[api] 未处理异常', err);
		return c.json({ error: '服务器内部错误' }, 500);
	});

	app.notFound((c) => c.json({ error: '接口不存在' }, 404));

	app.route('/api', api);

	return app;
}

export const app = createApp();
