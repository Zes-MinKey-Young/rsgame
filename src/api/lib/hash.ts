/**
 * 密码哈希：PBKDF2-SHA256，210000 次迭代，16 字节随机盐。
 * 存储格式：pbkdf2$<iterations>$<saltHex>$<hashHex>
 *
 * 使用 WebCrypto（Bun / Node 20 / Netlify Functions 均原生支持），无额外依赖。
 */

const ITERATIONS = 210_000;
const KEY_BYTES = 32;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += b.toString(16).padStart(2, '0');
	return out;
}

function fromHex(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

/** 恒定时间比较，避免计时侧信道 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
		key,
		KEY_BYTES * 8
	);
	return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(password, salt, ITERATIONS);
	return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
	const iterations = Number(parts[1]);
	if (!Number.isFinite(iterations) || iterations <= 0) return false;
	const actual = await pbkdf2(password, fromHex(parts[2]), iterations);
	return timingSafeEqual(actual, parts[3]);
}
