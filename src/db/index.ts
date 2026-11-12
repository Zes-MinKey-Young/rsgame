import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/** 连接串缺失时抛这个，便于 app.onError 给出可读提示而不是 502 */
export class DatabaseNotConfiguredError extends Error {
	constructor() {
		super(
			'缺少数据库连接串：请确认 Netlify 后台已注入 NETLIFY_DATABASE_URL（本地开发用 DATABASE_URL）'
		);
		this.name = 'DatabaseNotConfiguredError';
	}
}

export function connectionString(): string | undefined {
	return process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;
}

/**
 * 本地 Docker Postgres 和生产 Neon 都是标准 Postgres，同一个驱动即可。
 * max: 1 —— serverless 环境下每个实例只留一条连接。
 * prepare: false —— 兼容 Neon / PgBouncer 这类连接池。
 */
function createClient() {
	const url = connectionString();
	if (!url) {
		throw new DatabaseNotConfiguredError();
	}

	const client = postgres(url, {
		max: 1,
		prepare: false,
		idle_timeout: 20,
		connect_timeout: 10
	});

	return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createClient>;

let instance: Db | null = null;

/**
 * 惰性初始化。
 * 原来在模块加载时就建连接串并可能抛错，会导致整个函数冷启动失败、Netlify 直接回 502，
 * 看不到任何可读信息。改成首次使用时才建，异常会被 Hono 的 onError 捕获成 500 + 明确文案。
 */
function getInstance(): Db {
	if (!instance) instance = createClient();
	return instance;
}

export const db: Db = new Proxy({} as Db, {
	get(_target, property) {
		const real = getInstance();
		const value = Reflect.get(real, property, real);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

/** 健康检查用：真正打一次库，验证连通性 */
export async function pingDatabase(): Promise<void> {
	const real = getInstance();
	await real.execute(sql`select 1`);
}

export { schema };
