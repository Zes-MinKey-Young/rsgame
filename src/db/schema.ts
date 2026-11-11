import { relations } from 'drizzle-orm';
import {
	bigserial,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/**
 * 用户表
 * permission 为位掩码：1=TALK 4=BAN 16=DELETE 64=ROOT，0 表示已封禁
 */
export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		/** 一律以小写存储，便于唯一性校验 */
		username: text('username').notNull(),
		displayName: text('display_name').notNull(),
		passwordHash: text('password_hash').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		permission: integer('permission').notNull().default(0),
		bannedAt: timestamp('banned_at', { withTimezone: true })
	},
	(t) => [uniqueIndex('users_username_key').on(t.username)]
);

/**
 * 邀请码表，仅 ROOT 可签发
 * maxUses = 0 表示不限次数
 */
export const invites = pgTable(
	'invites',
	{
		code: text('code').primaryKey(),
		createdBy: text('created_by')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		maxUses: integer('max_uses').notNull().default(1),
		usedCount: integer('used_count').notNull().default(0),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('invites_created_by_idx').on(t.createdBy)]
);

/** 房间表，closedAt 非空表示已关闭 */
export const rooms = pgTable(
	'rooms',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		closedAt: timestamp('closed_at', { withTimezone: true })
	},
	(t) => [index('rooms_closed_at_idx').on(t.closedAt)]
);

/**
 * 消息表
 * id 单调递增，直接作为轮询游标
 * sender: 'user' | 'bot' | 'system'
 * batchId: Bot 长输出分块归组，前端按批折叠展示
 */
export const messages = pgTable(
	'messages',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		sender: text('sender').notNull(),
		content: text('content').notNull(),
		at: jsonb('at').$type<string[]>(),
		batchId: text('batch_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		recalledAt: timestamp('recalled_at', { withTimezone: true }),
		recalledBy: text('recalled_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => [
		index('messages_room_id_idx').on(t.roomId, t.id),
		index('messages_created_at_idx').on(t.createdAt)
	]
);

/**
 * Bot 会话表
 * 用于替代老实现里 `requireNextMessage` 的阻塞等待：
 * 每条新消息进来时，若房间存在 waiting 状态的会话，就推进一次状态机
 */
export const botSessions = pgTable(
	'bot_sessions',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		game: text('game').notNull(),
		state: jsonb('state').notNull().$type<Record<string, unknown>>(),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		/** 'waiting' | 'finished' */
		status: text('status').notNull().default('waiting'),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('bot_sessions_room_status_idx').on(t.roomId, t.status)]
);

export const messagesRelations = relations(messages, ({ one }) => ({
	user: one(users, { fields: [messages.userId], references: [users.id] }),
	room: one(rooms, { fields: [messages.roomId], references: [rooms.id] })
}));

export const roomsRelations = relations(rooms, ({ one }) => ({
	owner: one(users, { fields: [rooms.ownerId], references: [users.id] })
}));

export type UserRow = typeof users.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type BotSessionRow = typeof botSessions.$inferSelect;
