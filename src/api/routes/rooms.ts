import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../db';
import { messages, rooms, users } from '../../db/schema';
import { getCurrentUser, requireUser, type SafeUser } from '../lib/auth';
import { fail, readJson, str } from '../lib/http';
import { randomCode } from '../lib/ids';
import { retentionCutoff } from '../lib/messages';
import { canOpenRoom, canRecallAny, canSetPermission } from '../lib/perm';
import { serializeRoom } from '../lib/serialize';

export const roomRoutes = new Hono();

/** 关闭房间的权限：房主本人，或有 DELETE/ROOT */
function canClose(user: SafeUser, ownerId: string): boolean {
	return user.id === ownerId || canRecallAny(user.permission);
}

async function loadOpenRoom(id: string) {
	const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
	if (!room || room.closedAt !== null) fail(404, '房间不存在或已关闭');
	return room;
}

roomRoutes.get('/', async (c) => {
	await requireUser(c);

	const includeClosed = c.req.query('all') === '1';

	const rows = await db
		.select({
			room: rooms,
			ownerUsername: users.username,
			ownerDisplayName: users.displayName
		})
		.from(rooms)
		.leftJoin(users, eq(rooms.ownerId, users.id))
		.where(includeClosed ? sql`true` : isNull(rooms.closedAt))
		.orderBy(desc(rooms.createdAt))
		.limit(100);

	const stats = await db
		.select({
			roomId: messages.roomId,
			lastMessageAt: sql<string | null>`max(${messages.createdAt})::text`,
			messageCount: sql<number>`count(*)::int`
		})
		.from(messages)
		.where(gte(messages.createdAt, retentionCutoff()))
		.groupBy(messages.roomId);

	const statsMap = new Map(stats.map((s) => [s.roomId, s]));

	return c.json({
		rooms: rows.map((r) => {
			const s = statsMap.get(r.room.id);
			return serializeRoom(
				r.room,
				{ username: r.ownerUsername, displayName: r.ownerDisplayName },
				s
					? {
							lastMessageAt: s.lastMessageAt ? new Date(s.lastMessageAt) : null,
							messageCount: s.messageCount
						}
					: undefined
			);
		})
	});
});

roomRoutes.post('/', async (c) => {
	const user = await requireUser(c);
	if (!canOpenRoom(user.permission)) fail(403, '需要版主及以上权限才能创建房间');

	const body = await readJson(c);
	const name = str(body.name, 'name').trim();
	if (name.length === 0 || name.length > 30) fail(400, '房间名长度需在 1-30 之间');

	// 短码可能碰撞，重试几次
	for (let attempt = 0; attempt < 5; attempt++) {
		const id = randomCode(6);
		const [existing] = await db
			.select({ id: rooms.id })
			.from(rooms)
			.where(eq(rooms.id, id))
			.limit(1);
		if (existing) continue;

		const [created] = await db
			.insert(rooms)
			.values({ id, name, ownerId: user.id })
			.returning();

		return c.json(
			{
				room: serializeRoom(
					created,
					{ username: user.username, displayName: user.displayName },
					{ lastMessageAt: null, messageCount: 0 }
				)
			},
			201
		);
	}

	fail(500, '房间号生成失败，请重试');
});

roomRoutes.get('/:id', async (c) => {
	const user = await getCurrentUser(c);
	if (!user) fail(401, '未登录');

	const id = c.req.param('id');
	const [row] = await db
		.select({
			room: rooms,
			ownerUsername: users.username,
			ownerDisplayName: users.displayName
		})
		.from(rooms)
		.leftJoin(users, eq(rooms.ownerId, users.id))
		.where(eq(rooms.id, id))
		.limit(1);

	if (!row) fail(404, '房间不存在');

	return c.json({
		room: serializeRoom(
			row.room,
			{ username: row.ownerUsername, displayName: row.ownerDisplayName },
			undefined
		),
		canClose: row.room.closedAt === null && canClose(user, row.room.ownerId),
		isOwner: row.room.ownerId === user.id
	});
});

roomRoutes.post('/:id/close', async (c) => {
	const user = await requireUser(c);
	const id = c.req.param('id');

	const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
	if (!room) fail(404, '房间不存在');
	if (room.closedAt !== null) fail(400, '房间已关闭');

	if (!canClose(user, room.ownerId) && !canSetPermission(user.permission)) {
		fail(403, '只有房主或管理员可以关闭房间');
	}

	const [updated] = await db
		.update(rooms)
		.set({ closedAt: new Date() })
		.where(and(eq(rooms.id, id), isNull(rooms.closedAt)))
		.returning();

	return c.json({ room: serializeRoom(updated, null, undefined) });
});

export { loadOpenRoom };
