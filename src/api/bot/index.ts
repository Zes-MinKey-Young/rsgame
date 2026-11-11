import { handleBotIncoming, type BotContext } from './engine';
import type { ClientMessage } from '../lib/serialize';

/** 统一入口：发消息后调它，返回 Bot 追加的消息（可能为空数组） */
export async function runBot(ctx: BotContext): Promise<ClientMessage[]> {
	try {
		return await handleBotIncoming(ctx);
	} catch (err) {
		console.error('[bot] 处理失败', err);
		return [];
	}
}

export type { BotContext };
