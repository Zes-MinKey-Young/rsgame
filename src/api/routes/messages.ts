import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../db';
import { messages, rooms, users } from '../../db/schema';
import { runBot } from '../bot';
import { requireUser } from '../lib/auth';
import { fail, readJson, str } from '../lib/http';
import { insertMessage, listMessages, retentionCutoff } from '../lib/messages';
import { canRecallAny } from '../lib/perm';
import { serializeMessage } from '../lib/serialize';

const MAX_CONTENT = 2000;

/** 挂在 /api/rooms 下，与 roomRoutes 共享前缀 */
export const roomMessageRoutes = new Hono();

roomMessageRoutes.get('/:id/messages', async (c) => {
	await requireUser(c);
	const roomId = c.req.param('id');

	const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
	if (!room) fail(404, '房间不存在');

	const afterRaw = c.req.query('after');
	const after = afterRaw ? Number(afterRaw) : undefined;
	if (after !== undefined && !Number.isFinite(after)) fail(400, 'after 必须是数字');

	const limitRaw = c.req.query('limit');
	const limit = limitRaw ? Number(limitRaw) : 50;

	const list = await listMessages({ roomId, after, limit });
	return c.json({
		messages: list,
		retentionDays: 7,
		cutoff: retentionCutoff().toISOString()
	});
});

roomMessageRoutes.post('/:id/messages', async (c) => {
	const user = await requireUser(c);
	const roomId = c.req.param('id');

	const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
	if (!room || room.closedAt !== null) fail(404, '房间不存在或已关闭');

	const body = await readJson(c);
	const content = str(body.content, 'content').trim();
	if (!content) fail(400, '消息不能为空');
	if (content.length > MAX_CONTENT) fail(400, `单条消息最长 ${MAX_CONTENT} 字`);

	let at: string[] | null = null;
	if (Array.isArray(body.at)) {
		const filtered = body.at
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean)
			.slice(0, 10);
		at = filtered.length ? filtered : null;
	}

	const own = await insertMessage({
		roomId,
		userId: user.id,
		sender: 'user',
		content,
		at
	});

	// Bot 在同一请求内同步处理完毕，回复同样是消息行
	const botOut = await runBot({ roomId, user, content, at });

	return c.json({ messages: [own, ...botOut] }, 201);
});

/** 挂在 /api/messages 下 */
export const messageRoutes = new Hono();

messageRoutes.post('/:id/recall', async (c) => {
	const user = await requireUser(c);

	const id = Number(c.req.param('id'));
	if (!Number.isInteger(id) || id <= 0) fail(400, '消息 id 非法');

	const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
	if (!row) fail(404, '消息不存在');
	if (row.recalledAt !== null) fail(400, '该消息已被撤回');
	if (row.sender !== 'user') fail(400, '只能撤回用户发送的消息');

	const isOwn = row.userId === user.id;
	if (!isOwn && !canRecallAny(user.permission)) {
		fail(403, '只有管理员可以撤回他人的消息');
	}

	const [updated] = await db
		.update(messages)
		.set({ recalledAt: new Date(), recalledBy: user.id })
		.where(eq(messages.id, id))
		.returning();

	const author = updated.userId
		? (
				await db
					.select({ username: users.username, displayName: users.displayName })
					.from(users)
					.where(eq(users.id, updated.userId))
					.limit(1)
			)[0]
		: null;

	return c.json({ message: serializeMessage(updated, author ?? null) });
});
