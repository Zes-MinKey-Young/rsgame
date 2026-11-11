/**
 * 初始化 root 超级管理员。
 * 幂等：已存在 root 时直接跳过。
 */
import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import { hashPassword } from '../api/lib/hash';
import { uuid } from '../api/lib/ids';
import { Permission } from '../api/lib/perm';

const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

async function main() {
	if (!ROOT_PASSWORD) {
		console.error('[seed] 缺少 ROOT_PASSWORD 环境变量');
		process.exit(1);
	}
	if (ROOT_PASSWORD.length < 8) {
		console.error('[seed] ROOT_PASSWORD 长度至少 8 位');
		process.exit(1);
	}

	const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, 'root')).limit(1);
	if (existing) {
		console.log('[seed] root 已存在，跳过');
		process.exit(0);
	}

	await db.insert(users).values({
		id: uuid(),
		username: 'root',
		displayName: '管理员',
		passwordHash: await hashPassword(ROOT_PASSWORD),
		permission: Permission.ROOT | Permission.TALK
	});

	console.log('[seed] root 账号创建完成');
	process.exit(0);
}

await main();
