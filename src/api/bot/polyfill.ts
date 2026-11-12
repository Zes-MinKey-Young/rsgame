/**
 * localStorage polyfill（serverless 版）。
 *
 * 原版读写磁盘上的 localStorage.json；这里的数据由 data-store 提供：
 * 优先用 Netlify Blobs 里的版本，没有则退回构建期内联的基线。
 * 写入只落在进程内存里（游戏逻辑的写入分支实际是死代码）。
 */

import { storageView } from './data-store';

const EXPIRY_SUFFIX = '-EXPIRY';

function readStorage(): Record<string, string> {
	return storageView();
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
			const merged: Record<string, string> = {};
			for (const [key, value] of Object.entries({ format: 'json', ...options })) {
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
		const data = readStorage();
		for (const key of Object.keys(data)) delete data[key];
	},
	key: (index: number): string | null => {
		const keys = Object.keys(readStorage()).filter((k) => !k.endsWith(EXPIRY_SUFFIX));
		return keys[index] ?? null;
	},
	get length(): number {
		return Object.keys(readStorage()).filter((k) => !k.endsWith(EXPIRY_SUFFIX)).length;
	}
};
