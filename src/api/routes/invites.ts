import { desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { db } from '../../db';
import { invites, type InviteRow } from '../../db/schema';
import { requireUser, type SafeUser } from '../lib/auth';
import { fail, int, readJson } from '../lib/http';
import { randomCode } from '../lib/ids';
import { canInvite } from '../lib/perm';

export const inviteRoutes = new Hono();

function serializeInvite(row: InviteRow) {
	const now = Date.now();
	return {
		code: row.code,
		createdBy: row.createdBy,
		maxUses: row.maxUses,
		usedCount: row.usedCount,
		remaining: row.maxUses === 0 ? null : Math.max(0, row.maxUses - row.usedCount),
		createdAt: row.createdAt.toISOString(),
		expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
		revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
		expired: row.expiresAt ? row.expiresAt.getTime() <= now : false,
		exhausted: row.maxUses !== 0 && row.usedCount >= row.maxUses
	};
}

/** 仅 ROOT 可管理邀请码 */
async function requireRoot(c: Context): Promise<SafeUser> {
	const user = await requireUser(c);
	if (!canInvite(user.permission)) fail(403, '只有超级管理员可以管理邀请码');
	return user;
}

inviteRoutes.get('/', async (c) => {
	await requireRoot(c);
	const rows = await db.select().from(invites).orderBy(desc(invites.createdAt)).limit(200);
	return c.json({ invites: rows.map(serializeInvite) });
});

inviteRoutes.post('/', async (c) => {
	const user = await requireRoot(c);
	const body = await readJson(c);

	// maxUses: 0 表示不限次数
	const maxUses = body.maxUses === undefined ? 1 : int(body.maxUses, 'maxUses');
	if (maxUses < 0 || maxUses > 1000) fail(400, 'maxUses 需在 0-1000 之间（0 表示不限）');

	let expiresAt: Date | null = null;
	if (body.expiresInHours !== undefined && body.expiresInHours !== null) {
		const hours = int(body.expiresInHours, 'expiresInHours');
		if (hours <= 0 || hours > 24 * 365) fail(400, 'expiresInHours 需在 1-8760 之间');
		expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
	}

	const [created] = await db
		.insert(invites)
		.values({ code: randomCode(10), createdBy: user.id, maxUses, expiresAt })
		.returning();

	return c.json({ invite: serializeInvite(created) }, 201);
});

inviteRoutes.post('/:code/revoke', async (c) => {
	await requireRoot(c);
	const code = c.req.param('code');

	const [updated] = await db
		.update(invites)
		.set({ revokedAt: new Date() })
		.where(eq(invites.code, code))
		.returning();

	if (!updated) fail(404, '邀请码不存在');
	return c.json({ invite: serializeInvite(updated) });
});
