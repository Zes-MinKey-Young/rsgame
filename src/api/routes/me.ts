import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../db';
import { users } from '../../db/schema';
import { requireUser, toSafeUser } from '../lib/auth';
import { fail, readJson, str } from '../lib/http';
import { permissionLabel } from '../lib/perm';

export const meRoutes = new Hono();

/** 修改自己的昵称 */
meRoutes.post('/', async (c) => {
	const user = await requireUser(c);
	const body = await readJson(c);

	if (body.displayName === undefined) fail(400, '没有要修改的字段');

	const displayName = str(body.displayName, 'displayName').trim();
	if (displayName.length === 0 || displayName.length > 20) {
		fail(400, '昵称长度需在 1-20 之间');
	}

	const [updated] = await db
		.update(users)
		.set({ displayName })
		.where(eq(users.id, user.id))
		.returning();

	return c.json({
		user: { ...toSafeUser(updated), permissionLabel: permissionLabel(updated.permission) }
	});
});
