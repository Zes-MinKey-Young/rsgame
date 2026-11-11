/** 去掉易混淆字符（0/o、1/l/i）的字母表 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 生成密码学安全的随机短码，用于邀请码 / 房间 id */
export function randomCode(length = 8): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
	return out;
}

export function uuid(): string {
	return crypto.randomUUID();
}
