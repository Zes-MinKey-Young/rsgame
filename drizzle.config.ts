import { defineConfig } from 'drizzle-kit';

const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

// `drizzle-kit generate` 只读 schema、不连库，因此缺少连接串时不直接退出；
// push / migrate / studio 等需要连库的命令仍会因缺少 url 而报错。
if (!url) {
	console.warn('[drizzle] 未设置 NETLIFY_DATABASE_URL / DATABASE_URL，仅可执行 generate');
}

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './migrations',
	dialect: 'postgresql',
	...(url ? { dbCredentials: { url } } : {}),
	verbose: true,
	strict: true
});
