/**
 * localStorage polyfill 的 serverless 版本。
 *
 * 原版读写磁盘上的 localStorage.json；Netlify Functions 没有可写文件系统，
 * 因此改为：打包时把 localStorage.json 内联成只读基线，运行时写入落在进程内存里。
 *
 * 游戏逻辑用的是 getObject/getItem 的读取路径，写入只发生在
 * `~rshgt` 的每日限次分支（原版中 limitedGroups 恒为空，属于死代码），
 * 因此内存覆盖层不会影响任何实际行为。
 */

import seedData from './localStorage.json';

const EXPIRY_SUFFIX = '-EXPIRY';

const storage: Record<string, string> = { ...(seedData as unknown as Record<string, string>) };

function readStorage(): Record<string, string> {
	return storage;
}

function writeStorage(next: Record<string, string>): void {
	for (const key of Object.keys(storage)) delete storage[key];
	Object.assign(storage, next);
}

export const mw = {
	storage: {
		getObject: (key: string) => {
			const value = readStorage()[key];
			if (!value) {
				return null;
			}
			try {
				return JSON.parse(value);
			} catch {
				return null;
			}
		},
		setObject: (key: string, value: unknown, expirySecs: number = 0) => {
			const data = readStorage();
			data[key] = JSON.stringify(value);
			if (expirySecs > 0) {
				data[key + EXPIRY_SUFFIX] = String(Date.now() + expirySecs * 1000);
			}
		}
	},
	Api: class {
		ORIGIN = 'https://rs.miraheze.org';
		SCRIPT_URI = '/w/api.php';
		UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0';

		async get(options: Record<string, string | number>) {
			const merged: Record<string, string> = { format: 'json' } as Record<string, string>;
			for (const [key, value] of Object.entries(options)) {
				merged[key] = String(value);
			}
			const url = `${this.ORIGIN}${this.SCRIPT_URI}?${new URLSearchParams(merged).toString()}`;
			const res = await fetch(url, { headers: { 'User-Agent': this.UA } });
			const body = await res.text();
			if (!body.startsWith('{')) {
				throw new Error('Invalid JSON response');
			}
			return JSON.parse(body);
		}
	}
};

// localStorage polyfill（兼容性接口）
export const localStorage = {
	getItem: (key: string): string | null => {
		return readStorage()[key] ?? null;
	},
	setItem: (key: string, value: string): void => {
		readStorage()[key] = value;
	},
	removeItem: (key: string): void => {
		const data = readStorage();
		delete data[key];
		delete data[key + EXPIRY_SUFFIX];
	},
	clear: (): void => {
		writeStorage({});
	},
	key: (index: number): string | null => {
		const keys = Object.keys(readStorage()).filter((k) => !k.endsWith(EXPIRY_SUFFIX));
		return keys[index] ?? null;
	},
	get length(): number {
		return Object.keys(readStorage()).filter((k) => !k.endsWith(EXPIRY_SUFFIX)).length;
	}
};
