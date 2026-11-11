import { and, asc, eq, gt, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { messages, users } from '../../db/schema';
import { BOT_SENDER, serializeMessage, type ClientMessage } from './serialize';
import { randomCode } from './ids';

/** 消息保留期：7 天 */
export const RETENTION_DAYS = 7;

export function retentionCutoff(now = new Date()): Date {
	return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export interface InsertMessageInput {
	roomId: string;
	/** bot / system 消息传 null */
	userId: string | null;
	sender: 'user' | 'bot' | 'system';
	content: string;
	at?: string[] | null;
	batchId?: string | null;
}

export async function insertMessage(input: InsertMessageInput): Promise<ClientMessage> {
	const [row] = await db
		.insert(messages)
		.values({
			roomId: input.roomId,
			userId: input.userId,
			sender: input.sender,
			content: input.content,
			at: input.at ?? null,
			batchId: input.batchId ?? null
		})
		.returning();

	// bot / system 消息没有对应的 users 行，直接给固定身份
	if (input.sender !== 'user') {
		return serializeMessage(row, null);
	}

	const [author] = input.userId
		? await db
				.select({ username: users.username, displayName: users.displayName })
				.from(users)
				.where(eq(users.id, input.userId))
				.limit(1)
		: [];

	return serializeMessage(row, author ?? null);
}

/** Bot 长输出：多条消息共用一个 batchId，前端按批折叠 */
export async function insertBotBatch(roomId: string, lines: string[]): Promise<ClientMessage[]> {
	if (lines.length === 0) return [];
	const batchId = randomCode(10);
	const out: ClientMessage[] = [];
	for (const line of lines) {
		out.push(
			await insertMessage({
				roomId,
				userId: null,
				sender: 'bot',
				content: line,
				batchId
			})
		);
	}
	return out;
}

/** Bot 单条回复 */
export function insertBotMessage(roomId: string, content: string): Promise<ClientMessage> {
	return insertMessage({ roomId, userId: null, sender: 'bot', content });
}

export interface ListMessagesOptions {
	roomId: string;
	/** 只返回 id 大于该值的消息（轮询游标） */
	after?: number;
	limit?: number;
}

export async function listMessages(opts: ListMessagesOptions): Promise<ClientMessage[]> {
	const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

	const conditions = [eq(messages.roomId, opts.roomId), gte(messages.createdAt, retentionCutoff())];
	if (typeof opts.after === 'number' && Number.isFinite(opts.after)) {
		conditions.push(gt(messages.id, opts.after));
	}

	const rows = await db
		.select({
			message: messages,
			username: users.username,
			displayName: users.displayName
		})
		.from(messages)
		.leftJoin(users, eq(messages.userId, users.id))
		.where(and(...conditions))
		.orderBy(asc(messages.id))
		.limit(limit);

	return rows.map((r) =>
		serializeMessage(r.message, { username: r.username, displayName: r.displayName })
	);
}

/** 取某房间最新一条消息的 id，用于前端初始化游标 */
export async function latestMessageId(roomId: string): Promise<number> {
	const [row] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(and(eq(messages.roomId, roomId), gte(messages.createdAt, retentionCutoff())))
		.orderBy(sql`${messages.id} desc`)
		.limit(1);
	return row?.id ?? 0;
}

/** 删除超过保留期的消息，供定时函数调用 */
export async function purgeExpiredMessages(): Promise<number> {
	const deleted = await db
		.delete(messages)
		.where(
			and(
				sql`${messages.createdAt} < ${retentionCutoff()}`,
				isNotNull(messages.createdAt)
			)
		)
		.returning({ id: messages.id });
	return deleted.length;
}

export { BOT_SENDER };
