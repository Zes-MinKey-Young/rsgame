import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../db';
import { invites, users } from '../../db/schema';
import { getCurrentUser, login, logout, toSafeUser } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/hash';
import { fail, readJson, str } from '../lib/http';
import { uuid } from '../lib/ids';
import { Permission, isBanned } from '../lib/perm';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
	const body = await readJson(c);
	const username = str(body.username, 'username').trim().toLowerCase();
	const password = str(body.password, 'password');

	const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
	// 用户不存在与密码错误返回同样的文案，避免用户名枚举
	if (!row) fail(401, '用户名或密码错误');

	const ok = await verifyPassword(password, row.passwordHash);
	if (!ok) fail(401, '用户名或密码错误');
	if (isBanned(row.permission)) fail(403, '账号已被封禁');

	await login(c, row.id);
	return c.json({ user: toSafeUser(row) });
});

authRoutes.post('/register', async (c) => {
	const body = await readJson(c);
	const inviteCode = str(body.inviteCode, 'inviteCode').trim();
	const username = str(body.username, 'username').trim().toLowerCase();
	const password = str(body.password, 'password');
	const displayNameRaw = body.displayName;
	const displayName =
		typeof displayNameRaw === 'string' && displayNameRaw.trim()
			? displayNameRaw.trim()
			: username;

	if (!USERNAME_RE.test(username)) {
		fail(400, '用户名只能包含小写字母、数字和下划线，长度 3-20');
	}
	if (password.length < 8 || password.length > 128) {
		fail(400, '密码长度需在 8-128 位之间');
	}
	if (displayName.length > 20) {
		fail(400, '昵称最长 20 个字符');
	}

	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, username))
		.limit(1);
	if (existing) fail(409, '用户名已被占用');

	// 原子占用一次邀请名额：条件不满足时返回空数组
	const consumed = await db
		.update(invites)
		.set({ usedCount: sql`${invites.usedCount} + 1` })
		.where(
			and(
				eq(invites.code, inviteCode),
				sql`${invites.revokedAt} is null`,
				sql`(${invites.expiresAt} is null or ${invites.expiresAt} > now())`,
				sql`(${invites.maxUses} = 0 or ${invites.usedCount} < ${invites.maxUses})`
			)
		)
		.returning({ code: invites.code });

	if (consumed.length === 0) fail(400, '邀请码无效、已过期或已用尽');

	const passwordHash = await hashPassword(password);

	const [created] = await db
		.insert(users)
		.values({
			id: uuid(),
			username,
			displayName,
			passwordHash,
			permission: Permission.TALK
		})
		.returning();

	await login(c, created.id);
	return c.json({ user: toSafeUser(created) }, 201);
});

authRoutes.post('/logout', (c) => {
	logout(c);
	return c.json({ success: true });
});

authRoutes.get('/me', async (c) => {
	const user = await getCurrentUser(c);
	if (!user) {
		// 顺手清掉失效 cookie
		logout(c);
		return c.json({ user: null });
	}
	return c.json({ user });
});
