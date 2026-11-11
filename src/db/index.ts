import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
	throw new Error(
		'缺少数据库连接串：请设置 NETLIFY_DATABASE_URL（Netlify 自动注入）或 DATABASE_URL（本地开发）'
	);
}

/**
 * 本地 Docker Postgres 和生产 Neon 都是标准 Postgres，同一个驱动即可。
 * max: 1 —— serverless 环境下每个实例只留一条连接。
 * prepare: false —— 兼容 Neon / PgBouncer 这类连接池。
 */
const client = postgres(url, {
	max: 1,
	prepare: false,
	idle_timeout: 20,
	connect_timeout: 10
});

export const db = drizzle(client, { schema });
export { schema, client };
export type Db = typeof db;
