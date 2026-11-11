import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../db';
import { users, type UserRow } from '../../db/schema';
import { requireUser, toSafeUser } from '../lib/auth';
import { fail, boolean, int, readJson } from '../lib/http';
import {
	Permission,
	canBan,
	canDelete,
	canSetPermission,
	has,
	isStaff,
	permissionLabel
} from '../lib/perm';

export const userRoutes = new Hono();

/** 允许的权限位组合：只能是 1/4/16/64 的任意组合，且不能 > 65 */
const VALID_BITS = Permission.TALK | Permission.BAN | Permission.DELETE | Permission.ROOT;

function isValidPermission(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= VALID_BITS && (value & ~VALID_BITS) === 0;
}

async function findUser(username: string): Promise<UserRow> {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.username, username.trim().toLowerCase()))
		.limit(1);
	if (!row) fail(404, '用户不存在');
	return row;
}

/** 用户列表（版主及以上可见） */
userRoutes.get('/', async (c) => {
	const actor = await requireUser(c);
	if (!isStaff(actor.permission)) fail(403, '权限不足');

	const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(500);
	return c.json({
		users: rows.map((r) => ({ ...toSafeUser(r), permissionLabel: permissionLabel(r.permission) }))
	});
});

/** 公开资料 */
userRoutes.get('/:username', async (c) => {
	await requireUser(c);
	const row = await findUser(c.req.param('username'));
	return c.json({
		user: { ...toSafeUser(row), permissionLabel: permissionLabel(row.permission) }
	});
});

/** 封禁 / 解封 */
userRoutes.post('/:username/ban', async (c) => {
	const actor = await requireUser(c);
	if (!canBan(actor.permission)) fail(403, '需要版主及以上权限');

	const target = await findUser(c.req.param('username'));
	const body = await readJson(c);
	const banned = boolean(body.banned, 'banned');

	if (target.id === actor.id) fail(400, '不能封禁自己');
	if (has(target.permission, Permission.ROOT)) fail(403, '不能封禁超级管理员');
	if (target.permission >= actor.permission && !has(actor.permission, Permission.ROOT)) {
		fail(403, '不能封禁权限不低于自己的用户');
	}

	const [updated] = await db
		.update(users)
		.set(
			banned
				? { permission: 0, bannedAt: new Date() }
				: { permission: Permission.TALK, bannedAt: null }
		)
		.where(eq(users.id, target.id))
		.returning();

	return c.json({ user: { ...toSafeUser(updated), permissionLabel: permissionLabel(updated.permission) } });
});

/** 修改权限位 */
userRoutes.post('/:username/permission', async (c) => {
	const actor = await requireUser(c);
	if (!canSetPermission(actor.permission)) fail(403, '需要管理及以上权限');

	const target = await findUser(c.req.param('username'));
	const body = await readJson(c);
	const permission = int(body.permission, 'permission');

	if (!isValidPermission(permission)) fail(400, '非法的权限值');

	// 不能修改权限高于自己（或与自己相当）的用户，admin 自身除外
	if (target.id !== actor.id && target.permission >= actor.permission) {
		fail(403, '不能修改权限不低于自己的用户');
	}
	// 只有 ROOT 能授予 ROOT
	if (has(permission, Permission.ROOT) && !has(actor.permission, Permission.ROOT)) {
		fail(403, '只有超级管理员可以授予超级管理员');
	}

	const [updated] = await db
		.update(users)
		.set({ permission, bannedAt: permission === 0 ? new Date() : null })
		.where(eq(users.id, target.id))
		.returning();

	return c.json({ user: { ...toSafeUser(updated), permissionLabel: permissionLabel(updated.permission) } });
});

/** 删号（仅 ROOT） */
userRoutes.post('/:username/delete', async (c) => {
	const actor = await requireUser(c);
	if (!canDelete(actor.permission)) fail(403, '只有超级管理员可以删除用户');

	const target = await findUser(c.req.param('username'));
	if (target.id === actor.id) fail(400, '不能删除自己');
	if (has(target.permission, Permission.ROOT)) fail(403, '不能删除超级管理员');

	await db.delete(users).where(eq(users.id, target.id));
	return c.json({ success: true });
});
