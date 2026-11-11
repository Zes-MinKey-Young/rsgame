/**
 * Bot 差异层。
 *
 * 游戏业务代码（RSQuery.ts / RSList.ts / data.ts）保持与原版 rsgame 一致，
 * 这里提供它们在原版里依赖的全部 API（Bot 类、CommandRule、参数解析）
 * 并把「WebSocket 长连接 + 阻塞等待下一条消息」替换为
 * 「输出缓冲 + 消息转录回放（replay）」。
 *
 * 回放机制：
 *   每次有新消息进来，都用「到目前为止的全部消息转录」把 handler 从头重跑一遍。
 *   requireNextMessage 按顺序从转录里取消息，取完就抛 SuspendSignal 挂起。
 *   由于转录只会追加、不会修改，重跑过程是确定性的（Math.random 由固定种子接管），
 *   所以每轮只会比上一轮多产出新的输出，配合 emitted 水位线即可去重。
 */

export enum At {
	NO,
	YES,
	OPTIONAL
}

export interface GroupMessage {
	group_id: string;
	user_id: string;
	content: string;
	at?: string[];
}

export interface CommandRule {
	name: string;
	help: string;
	at?: At;
	handler: (
		bot: Bot,
		message: GroupMessage,
		text: string
	) => Promise<void | 'help'> | void | 'help';
}

/** 本轮转录已经用尽，handler 需要挂起等待下一条消息 */
export class SuspendSignal extends Error {
	constructor() {
		super('__bot_suspend__');
		this.name = 'SuspendSignal';
	}
}

/** Bot 的一条输出，batch 表示它属于 sendPack 的长列表 */
export interface BotOutput {
	text: string;
	batch: boolean;
}

/* ------------------------------------------------------------------ */
/* 参数解析（与原版逐字一致，仅补了 string | null 的类型标注）           */
/* ------------------------------------------------------------------ */

export function whitespaceArgParse(text: string): string[] {
	const result: string[] = [];
	let currentToken = '';
	let startingQuote: string | null = null;
	let escaped = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (/\s/.test(char) && !startingQuote) {
			if (currentToken.trim() !== '') {
				result.push(currentToken.trim());
				currentToken = '';
			}
			continue;
		}

		if (char === "'" || char === '"') {
			if (currentToken !== '' && !startingQuote) {
				result.push(currentToken.trim());
				currentToken = '';
			}
			currentToken += char === "'" ? '"' : char;
			if (escaped) {
				// 转义中的引号，原样保留
			} else if (char === startingQuote) {
				startingQuote = null;
				result.push(JSON.parse(currentToken));
				currentToken = '';
			} else if (!startingQuote) {
				startingQuote = char;
			}
		} else if (char === '\\') {
			currentToken += char;
			escaped = !escaped;
		} else {
			currentToken += char;
			if (escaped) {
				escaped = false;
			}
		}
	}

	if (currentToken.trim() !== '') {
		if (startingQuote) {
			throw new Error('未闭合的字符串');
		}
		result.push(currentToken.trim());
	}

	return result;
}

export function newlineArgParse(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

/* ------------------------------------------------------------------ */
/* Bot                                                                 */
/* ------------------------------------------------------------------ */

export const BOT_IDENTITY = { name: 'bot', display_name: '萨卡班' } as const;

const COMMAND_MATCHERS = new Map<string, RegExp>();

function matcherOf(name: string): RegExp {
	let re = COMMAND_MATCHERS.get(name);
	if (!re) {
		re = new RegExp(`^[~～]${name}(?: |\n|$)`);
		COMMAND_MATCHERS.set(name, re);
	}
	return re;
}

export class Bot {
	/** 已注册的命令，`,help` 内部会读取 */
	readonly commands: CommandRule[] = [];
	/** 本次执行产生的输出，由外层落库 */
	readonly outputs: BotOutput[] = [];

	private transcript: GroupMessage[];
	private cursor = 0;

	constructor(transcript: GroupMessage[] = []) {
		this.transcript = transcript;
	}

	async init(): Promise<void> {
		this.registerCommand({
			name: 'help',
			help: '输出本帮助。用法：~help [命令名]',
			at: At.OPTIONAL,
			handler: (bot, message, text) => {
				let args: string[];
				try {
					args = whitespaceArgParse(text);
				} catch (e) {
					return void bot.sendText(message, (e as Error).message);
				}

				const name = args[1];
				if (!name) {
					bot.sendPack(message, [
						`在本房间共搜索到 ${this.commands.length} 条可用的命令：`,
						...this.commands.map((cmd) => '~' + cmd.name + '\n' + cmd.help)
					]);
				} else {
					const command = this.commands.find((cmd) => cmd.name === name);
					if (!command) {
						return void bot.sendText(message, '没有找到命令' + name);
					}
					bot.sendText(message, '~' + command.name + '\n' + command.help);
				}
			}
		});
	}

	registerCommand(rule: CommandRule): void {
		this.commands.push(rule);
	}

	/** 匹配 `~name` 形式的命令，与原版 registerCommand 的正则一致 */
	findCommand(text: string): CommandRule | undefined {
		return this.commands.find((rule) => matcherOf(rule.name).test(text));
	}

	sendText(_context: GroupMessage, text: string): void {
		this.outputs.push({ text, batch: false });
	}

	sendReply(context: GroupMessage, text: string): void {
		this.sendText(context, text);
	}

	async sendPack(_context: GroupMessage, messages: string[]): Promise<void> {
		// 原版这里每 100 条分一块并 sleep 2 秒；serverless 里不能真的睡，直接全部入缓冲
		for (const text of messages) {
			this.outputs.push({ text, batch: true });
		}
	}

	/**
	 * 原版是挂一个 EventTarget 监听器等下一条消息。
	 * 这里改为顺序消费转录；转录用尽即抛 SuspendSignal 让 handler 挂起。
	 */
	async requireNextMessage(
		predicate: (message: GroupMessage) => boolean | Promise<boolean>,
		_timeout?: number
	): Promise<GroupMessage> {
		while (this.cursor < this.transcript.length) {
			const message = this.transcript[this.cursor];
			this.cursor += 1;
			if (await predicate(message)) {
				return message;
			}
		}
		throw new SuspendSignal();
	}
}

/* ------------------------------------------------------------------ */
/* 确定性随机（保证回放时 Math.random 序列一致）                        */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * 在 fn 执行期间接管 Math.random。
 * Netlify 每个函数实例一次只处理一个请求，因此不存在并发串扰。
 */
export async function withSeededRandom<T>(seed: number, fn: () => Promise<T>): Promise<T> {
	const original = Math.random;
	Math.random = mulberry32(seed);
	try {
		return await fn();
	} finally {
		Math.random = original;
	}
}
