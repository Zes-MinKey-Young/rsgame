import { app } from '../../src/api/app';

// Netlify Functions v2：直接用 config.path 挂载，无需 redirect 重写
export const config = {
	path: '/api/*'
};

export default async function handler(req: Request): Promise<Response> {
	return app.fetch(req);
}
