import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db } from '../../db';
import { users, type UserRow } from '../../db/schema';
import { fail } from './http';
import { COOKIE_NAME, createToken, verifyToken } from './jwt';
import { has, isBanned } from './perm';

/** 对外暴露的用户对象（不含密码哈希） */
export interface SafeUser {
	id: string;
	username: string;
	displayName: string;
	permission: number;
	createdAt: string;
	bannedAt: string | null;
}

export function toSafeUser(row: UserRow): SafeUser {
	return {
		id: row.id,
		username: row.username,
		displayName: row.displayName,
		permission: row.permission,
		createdAt: row.createdAt.toISOString(),
		bannedAt: row.bannedAt ? row.bannedAt.toISOString() : null
	};
}

/**
 * 解析当前登录用户。
 * 每次都回查数据库，确保权限/封禁状态实时生效（老实现读的是 JWT 里的快照，会滞后 7 天）。
 */
export async function getCurrentUser(c: Context): Promise<SafeUser | null> {
	const token = getCookie(c, COOKIE_NAME);
	if (!token) return null;

	const userId = await verifyToken(token);
	if (!userId) return null;

	const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!row) return null;

	const safe = toSafeUser(row);
	// 被封禁的账号视为未登录
	if (isBanned(safe.permission)) return null;
	return safe;
}

/** 要求已登录（且未被封禁），否则 401 */
export async function requireUser(c: Context): Promise<SafeUser> {
	const user = await getCurrentUser(c);
	if (!user) fail(401, '未登录或登录已失效');
	return user;
}

/** 要求具备指定权限位，否则 403 */
export async function requirePermission(c: Context, required: number): Promise<SafeUser> {
	const user = await requireUser(c);
	if (!has(user.permission, required)) fail(403, '权限不足');
	return user;
}

export async function login(c: Context, userId: string): Promise<void> {
	const token = await createToken(userId);
	const secure = new URL(c.req.url).protocol === 'https:';
	setCookie(c, COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: 'Lax',
		secure,
		path: '/',
		maxAge: 60 * 60 * 24 * 7
	});
}

export function logout(c: Context): void {
	deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export { canOpenRoom, canRecallAny } from './perm';
