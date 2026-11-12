/**
 * 关卡数据（原来打包在构建产物里的 localStorage.json）的存取层。
 *
 * 优先级：Netlify Blobs 里的版本 > 构建期内联的基线。
 * 这样更新关卡表只要在后台传一次文件，不用重新构建。
 *
 * 注意：数据在模块加载时读取一次并缓存在实例内存里。
 * 上传新版本后，已预热的函数实例仍用旧数据，要等下一次冷启动才生效。
 */

import seedData from './localStorage.json';

const BLOB_STORE = 'rsgame-bot-data';
const BLOB_KEY = 'localStorage.json';

/** 游戏层必需的两个键，缺一个 ~rs 就跑不起来 */
export const REQUIRED_KEYS = ['rswiki:NavLevel-data', 'rswiki:NavLevel-difficulty'] as const;

export type StorageMap = Record<string, string>;

export interface BotDataStatus {
	source: 'blob' | 'bundled';
	updatedAt: string | null;
	uploadedBy: string | null;
	bytes: number;
	keys: string[];
	lastError?: string;
}

const seed = seedData as unknown as StorageMap;

function byteSize(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

let storage: StorageMap = { ...seed };

let status: BotDataStatus = {
	source: 'bundled',
	updatedAt: null,
	uploadedBy: null,
	bytes: byteSize(seed),
	keys: Object.keys(seed)
};

export function storageView(): StorageMap {
	return storage;
}

export function botDataStatus(): BotDataStatus {
	return status;
}

async function blobStore() {
	const { getStore } = await import('@netlify/blobs');
	return getStore({ name: BLOB_STORE, consistency: 'strong' });
}

/** 冷启动时尝试用 Blob 里的版本覆盖内联基线；失败就保持基线并记录原因 */
export async function loadBotData(): Promise<void> {
	try {
		const store = await blobStore();
		const remote = await store.get(BLOB_KEY, { type: 'json' });
		if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return;

		const map = remote as StorageMap;
		if (!REQUIRED_KEYS.every((key) => typeof map[key] === 'string')) return;

		const meta = await store.getMetadata(BLOB_KEY);
		storage = map;
		status = {
			source: 'blob',
			updatedAt: (meta?.metadata?.updatedAt as string) ?? null,
			uploadedBy: (meta?.metadata?.uploadedBy as string) ?? null,
			bytes: byteSize(map),
			keys: Object.keys(map)
		};
		console.log(`[bot-data] 已从 Blobs 载入 ${status.keys.length} 个键`);
	} catch (err) {
		const message = (err as Error).message;
		status = { ...status, lastError: message };
		console.warn('[bot-data] Blobs 不可用，使用构建期内联数据：', message);
	}
}

/** 校验管理员上传的数据，返回清洗后的副本 */
export function validateBotData(input: unknown): StorageMap {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		throw new Error('关卡数据必须是一个 JSON 对象');
	}

	const raw = input as Record<string, unknown>;
	for (const key of REQUIRED_KEYS) {
		const value = raw[key];
		if (typeof value !== 'string') {
			throw new Error(`缺少键 “${key}”，或它的值不是字符串`);
		}
		try {
			JSON.parse(value);
		} catch {
			throw new Error(`键 “${key}” 的内容不是合法 JSON`);
		}
	}

	const cleaned: StorageMap = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string') cleaned[key] = value;
	}
	return cleaned;
}

export async function saveBotData(map: StorageMap, uploadedBy: string): Promise<BotDataStatus> {
	const store = await blobStore();
	const updatedAt = new Date().toISOString();

	await store.setJSON(BLOB_KEY, map, {
		metadata: { updatedAt, uploadedBy, bytes: byteSize(map), keys: Object.keys(map) }
	});

	// 让当前这个实例立刻看到新数据（其它实例要等冷启动）
	storage = map;
	status = {
		source: 'blob',
		updatedAt,
		uploadedBy,
		bytes: byteSize(map),
		keys: Object.keys(map)
	};

	return status;
}

// 模块加载即拉取一次
await loadBotData();
