import type { MessageRow, RoomRow } from '../../db/schema';

/** 前端使用的消息形状 */
export interface ClientMessage {
	id: number;
	roomId: string;
	sender: 'user' | 'bot' | 'system';
	user: { username: string; displayName: string } | null;
	content: string;
	at: string[] | null;
	batchId: string | null;
	createdAt: string;
	recalled: boolean;
}

export const BOT_SENDER = { username: 'bot', displayName: '萨卡班' };

export interface MessageJoinUser {
	username: string | null;
	displayName: string | null;
}

export function serializeMessage(row: MessageRow, user: MessageJoinUser | null): ClientMessage {
	const sender = row.sender as ClientMessage['sender'];
	let identity: ClientMessage['user'] = null;
	if (sender === 'bot') {
		identity = BOT_SENDER;
	} else if (user?.username) {
		identity = { username: user.username, displayName: user.displayName ?? user.username };
	}

	const recalled = row.recalledAt !== null;

	return {
		id: row.id,
		roomId: row.roomId,
		sender,
		user: identity,
		content: recalled ? '' : row.content,
		at: recalled ? null : row.at,
		batchId: row.batchId,
		createdAt: row.createdAt.toISOString(),
		recalled
	};
}

export interface ClientRoom {
	id: string;
	name: string;
	ownerUsername: string | null;
	ownerDisplayName: string | null;
	createdAt: string;
	closed: boolean;
	lastMessageAt: string | null;
	messageCount: number;
}

export function serializeRoom(
	row: RoomRow,
	owner: { username: string | null; displayName: string | null } | null,
	stats: { lastMessageAt: Date | null; messageCount: number } | undefined
): ClientRoom {
	return {
		id: row.id,
		name: row.name,
		ownerUsername: owner?.username ?? null,
		ownerDisplayName: owner?.displayName ?? null,
		createdAt: row.createdAt.toISOString(),
		closed: row.closedAt !== null,
		lastMessageAt: stats?.lastMessageAt ? stats.lastMessageAt.toISOString() : null,
		messageCount: stats?.messageCount ?? 0
	};
}
