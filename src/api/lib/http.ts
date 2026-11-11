import type { Context } from 'hono';

/** 统一的业务异常，被 app.onError 捕获后转成 { error } 响应 */
export class HttpError extends Error {
	constructor(
		public status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
		message: string
	) {
		super(message);
	}
}

export function fail(
	status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
	message: string
): never {
	throw new HttpError(status, message);
}

export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
	try {
		return (await c.req.json()) as T;
	} catch {
		fail(400, '请求体不是合法的 JSON');
	}
}

export function str(value: unknown, field: string): string {
	if (typeof value !== 'string') fail(400, `${field} 必须是字符串`);
	return value;
}

export function int(value: unknown, field: string): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(n)) fail(400, `${field} 必须是整数`);
	return n;
}

export function boolean(value: unknown, field: string): boolean {
	if (typeof value !== 'boolean') fail(400, `${field} 必须是布尔值`);
	return value;
}
