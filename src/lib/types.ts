export interface User {
	id: string;
	username: string;
	displayName: string;
	permission: number;
	createdAt: string;
	bannedAt: string | null;
	permissionLabel?: string;
}

export interface Room {
	id: string;
	name: string;
	ownerUsername: string | null;
	ownerDisplayName: string | null;
	createdAt: string;
	closed: boolean;
	lastMessageAt: string | null;
	messageCount: number;
}

export interface ChatMessage {
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

export interface Invite {
	code: string;
	createdBy: string;
	maxUses: number;
	usedCount: number;
	remaining: number | null;
	createdAt: string;
	expiresAt: string | null;
	revokedAt: string | null;
	expired: boolean;
	exhausted: boolean;
}
