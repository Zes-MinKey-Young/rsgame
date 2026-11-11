import { SignJWT, jwtVerify } from 'jose';

const TOKEN_TTL = '7d';
const COOKIE_NAME = 'token';

function secret(): Uint8Array {
	const value =
		process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret');
	if (!value) throw new Error('缺少 JWT_SECRET 环境变量');
	return new TextEncoder().encode(value);
}

export async function createToken(userId: string): Promise<string> {
	return new SignJWT({ userId })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(TOKEN_TTL)
		.sign(secret());
}

/** 校验 token，成功返回 userId，失败返回 null */
export async function verifyToken(token: string): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, secret());
		const userId = payload.userId;
		return typeof userId === 'string' ? userId : null;
	} catch {
		return null;
	}
}

export { COOKIE_NAME };
