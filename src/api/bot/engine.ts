/**
 * Bot 引擎：负责「会话生命周期 + 转录回放 + 输出落库」。
 *
 * 游戏业务代码（RSQuery / RSList）在下面被原样注册进来，不做任何改动；
 * 原版依赖的阻塞式 `await requireNextMessage()` 由 bot.ts 里的回放机制实现。
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { botSessions, type BotSessionRow } from '../../db/schema';
import type { SafeUser } from '../lib/auth';
import { randomCode } from '../lib/ids';
import { insertBotBatch, insertBotMessage } from '../lib/messages';
import type { ClientMessage } from '../lib/serialize';
import rsQuery from './RSQuery';
import rsList, { RSHGT } from './RSList';
import { Bot, SuspendSignal, withSeededRandom } from './bot';
import type { BotOutput, CommandRule, GroupMessage } from './bot';

export interface BotContext {
	roomId: string;
	user: SafeUser;
	content: string;
	at: string[] | null;
}

/** 存在 bot_sessions.state 里的会话快照 */
interface SessionState {
	command: string;
	/** 触发命令的原始文本，如 "~rshgt" */
	text: string;
	/** 触发命令的那条消息 */
	trigger: GroupMessage;
	/** 已经被 requireNextMessage 消费过的消息序列（只追加） */
	transcript: GroupMessage[];
	/** 已经落库的输出条数，用于回放去重 */
	emitted: number;
	/** 固定随机种子，保证回放确定性 */
	seed: number;
}

const COMMAND_RULES: CommandRule[] = [rsQuery as CommandRule, rsList as CommandRule, RSHGT];

/** 转录上限，超出视为异常会话直接结束 */
const MAX_TRANSCRIPT = 200;
/** 会话闲置超时 */
const SESSION_TTL_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ */

async function createBot(transcript: GroupMessage[]): Promise<Bot> {
	const bot = new Bot(transcript);
	await bot.init();
	for (const rule of COMMAND_RULES) bot.registerCommand(rule);
	return bot;
}

interface ReplayResult {
	outputs: BotOutput[];
	suspended: boolean;
}

async function replay(
	commandName: string,
	text: string,
	trigger: GroupMessage,
	transcript: GroupMessage[],
	seed: number
): Promise<ReplayResult> {
	const bot = await createBot(transcript);
	const rule = bot.commands.find((c) => c.name === commandName);
	if (!rule) return { outputs: [], suspended: false };

	let suspended = false;

	await withSeededRandom(seed, async () => {
		try {
			const result = await rule.handler(bot, trigger, text);
			if (result === 'help') {
				bot.sendText(trigger, rule.help);
			}
		} catch (err) {
			if (err instanceof SuspendSignal) {
				suspended = true;
			} else {
				throw err;
			}
		}
	});

	return { outputs: [...bot.outputs], suspended };
}

/** 把输出缓冲区写成消息行，连续的 batch 输出归到同一个批次 */
async function persist(roomId: string, outputs: BotOutput[]): Promise<ClientMessage[]> {
	const created: ClientMessage[] = [];
	let i = 0;

	while (i < outputs.length) {
		if (!outputs[i].batch) {
			created.push(await insertBotMessage(roomId, outputs[i].text));
			i += 1;
			continue;
		}
		const lines: string[] = [];
		while (i < outputs.length && outputs[i].batch) {
			lines.push(outputs[i].text);
			i += 1;
		}
		created.push(...(await insertBotBatch(roomId, lines)));
	}

	return created;
}

/* ------------------------------------------------------------------ */

async function findWaitingSession(roomId: string): Promise<BotSessionRow | null> {
	const [row] = await db
		.select()
		.from(botSessions)
		.where(and(eq(botSessions.roomId, roomId), eq(botSessions.status, 'waiting')))
		.limit(1);
	return row ?? null;
}

async function finishSession(id: string): Promise<void> {
	await db
		.update(botSessions)
		.set({ status: 'finished', updatedAt: new Date() })
		.where(eq(botSessions.id, id));
}

async function finishAllSessions(roomId: string): Promise<void> {
	await db
		.update(botSessions)
		.set({ status: 'finished', updatedAt: new Date() })
		.where(and(eq(botSessions.roomId, roomId), eq(botSessions.status, 'waiting')));
}

function asState(raw: unknown): SessionState {
	return raw as SessionState;
}

/* ------------------------------------------------------------------ */

/** 开启一条新命令（可能立刻挂起，形成游戏会话） */
async function startCommand(
	rule: CommandRule,
	ctx: BotContext,
	trigger: GroupMessage
): Promise<ClientMessage[]> {
	const seed = Math.floor(Math.random() * 0x7fffffff);
	const result = await replay(rule.name, ctx.content, trigger, [], seed);

	if (result.suspended) {
		const state: SessionState = {
			command: rule.name,
			text: ctx.content,
			trigger,
			transcript: [],
			emitted: result.outputs.length,
			seed
		};

		await finishAllSessions(ctx.roomId);
		await db.insert(botSessions).values({
			id: randomCode(12),
			roomId: ctx.roomId,
			game: rule.name,
			state: state as unknown as Record<string, unknown>,
			createdBy: ctx.user.id,
			status: 'waiting',
			updatedAt: new Date()
		});
	}

	return persist(ctx.roomId, result.outputs);
}

/** 用新消息推进已存在的会话 */
async function advanceSession(
	session: BotSessionRow,
	message: GroupMessage
): Promise<ClientMessage[]> {
	const state = asState(session.state);

	if (Date.now() - session.updatedAt.getTime() > SESSION_TTL_MS) {
		await finishSession(session.id);
		return [];
	}

	const transcript = [...(state.transcript ?? []), message];
	if (transcript.length > MAX_TRANSCRIPT) {
		await finishSession(session.id);
		return [];
	}

	const result = await replay(state.command, state.text, state.trigger, transcript, state.seed);
	const fresh = result.outputs.slice(state.emitted);

	const nextState: SessionState = {
		...state,
		transcript,
		emitted: Math.max(state.emitted, result.outputs.length)
	};

	await db
		.update(botSessions)
		.set({
			state: nextState as unknown as Record<string, unknown>,
			status: result.suspended ? 'waiting' : 'finished',
			updatedAt: new Date()
		})
		.where(eq(botSessions.id, session.id));

	return persist(session.roomId, fresh);
}

/* ------------------------------------------------------------------ */

export async function handleBotIncoming(ctx: BotContext): Promise<ClientMessage[]> {
	const message: GroupMessage = {
		group_id: ctx.roomId,
		user_id: ctx.user.username,
		content: ctx.content,
		at: ctx.at ?? undefined
	};

	const created: ClientMessage[] = [];

	// 1) 有等待中的会话 → 先用这条消息推进它
	const session = await findWaitingSession(ctx.roomId);
	if (session) {
		created.push(...(await advanceSession(session, message)));
	}

	// 2) 命令分发
	const dispatcher = await createBot([]);
	const rule = dispatcher.findCommand(ctx.content);
	if (rule) {
		const sameGame = session && asState(session.state).command === rule.name;
		// 同一局游戏进行中，不因为重复输入 ~rshgt 而重开
		if (!sameGame) {
			created.push(...(await startCommand(rule, ctx, message)));
		}
	}

	return created;
}
