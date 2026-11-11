import { defineConfig } from 'drizzle-kit';

const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
	console.error('[drizzle] 缺少 NETLIFY_DATABASE_URL / DATABASE_URL 环境变量');
	process.exit(1);
}

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './migrations',
	dialect: 'postgresql',
	dbCredentials: { url },
	verbose: true,
	strict: true
});
