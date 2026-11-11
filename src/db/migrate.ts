import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
	console.error('[migrate] 缺少 NETLIFY_DATABASE_URL / DATABASE_URL');
	process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false });

await migrate(drizzle(client), { migrationsFolder: './migrations' });
await client.end();

console.log('[migrate] 迁移完成');
process.exit(0);
