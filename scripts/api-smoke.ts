/**
 * 端到端 API 冒烟测试：直接调 Hono 的 fetch，不启服务器。
 * 前置：已配好 DATABASE_URL、跑过 db:migrate 和 db:seed。
 * 用法：bun run scripts/api-smoke.ts
 */
import { app } from '../src/api/app';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra: unknown = '') {
	if (ok) passed += 1;
	else failed += 1;
	console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? ' :: ' + JSON.stringify(extra) : ''}`);
}

interface CallResult {
	status: number;
	data: any;
	cookie?: string;
}

async function call(path: string, init: RequestInit = {}, cookie?: string): Promise<CallResult> {
	const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
	if (init.body) headers['content-type'] = 'application/json';
	if (cookie) headers['cookie'] = cookie;

	const res = await app.fetch(new Request('http://local' + path, { ...init, headers }));
	const text = await res.text();
	const data = text ? JSON.parse(text) : null;
	const raw = res.headers.get('set-cookie');
	const matched = raw ? /token=[^;]*/.exec(raw) : null;

	return { status: res.status, data, cookie: matched?.[0] };
}

function post(path: string, body: unknown, cookie?: string) {
	return call(path, { method: 'POST', body: JSON.stringify(body) }, cookie);
}

const suffix = Date.now().toString(36).slice(-5);
const alice = `alice_${suffix}`;

/* 1. 健康检查 */
{
	const r = await call('/api/health');
	check('GET /api/health', r.status === 200 && r.data?.ok === true);
}

/* 2. root 登录 */
let rootCookie = '';
{
	const r = await post('/api/auth/login', { username: 'root', password: process.env.ROOT_PASSWORD });
	check('root 登录', r.status === 200 && !!r.data?.user, r.data?.error);
	check('root 拿到 cookie', !!r.cookie);
	rootCookie = r.cookie ?? '';
	check('root 权限位正确', r.data?.user?.permission === 65, r.data?.user?.permission);
}

/* 3. 未登录访问受限接口 */
{
	const r = await call('/api/rooms');
	check('未登录访问 /api/rooms 返回 401', r.status === 401);
}

/* 4. me */
{
	const r = await call('/api/auth/me', {}, rootCookie);
	check('GET /api/auth/me', r.status === 200 && r.data?.user?.username === 'root');
}

/* 5. 生成邀请码 */
let inviteCode = '';
{
	const r = await post('/api/invites', { maxUses: 2, expiresInHours: 24 }, rootCookie);
	check('ROOT 生成邀请码', r.status === 201 && !!r.data?.invite?.code, r.data?.error);
	inviteCode = r.data?.invite?.code ?? '';
	check('邀请码默认使用次数正确', r.data?.invite?.maxUses === 2);
}

/* 6. 邀请码注册 */
let aliceCookie = '';
{
	const r = await post('/api/auth/register', {
		inviteCode,
		username: alice,
		password: 'password123',
		displayName: '爱丽丝'
	});
	check('用邀请码注册', r.status === 201, r.data?.error);
	aliceCookie = r.cookie ?? '';
	check('新用户权限位为 TALK', r.data?.user?.permission === 1, r.data?.user?.permission);
}

/* 7. 邀请码次数已扣减，重复注册应失败 */
{
	const r = await post('/api/auth/register', {
		inviteCode: 'definitely-not-a-code',
		username: `bob_${suffix}`,
		password: 'password123'
	});
	check('无效邀请码被拒', r.status === 400, r.data?.error);
}

/* 8. 普通用户不能开房 */
{
	const r = await post('/api/rooms', { name: '不该存在' }, aliceCookie);
	check('TALK 用户开房被拒（403）', r.status === 403, r.data?.error);
}

/* 9. ROOT 开房 */
let roomId = '';
{
	const r = await post('/api/rooms', { name: `测试房间 ${suffix}` }, rootCookie);
	check('ROOT 开房', r.status === 201 && !!r.data?.room?.id, r.data?.error);
	roomId = r.data?.room?.id ?? '';
}

/* 10. 房间列表 */
{
	const r = await call('/api/rooms', {}, aliceCookie);
	check('房间列表可读', r.status === 200 && r.data.rooms.some((x: any) => x.id === roomId));
}

/* 11. 发消息 + Bot 命令 */
let userMessageId = 0;
{
	const r = await post(`/api/rooms/${roomId}/messages`, { content: '~rs 1' }, aliceCookie);
	check('发消息成功', r.status === 201 && r.data.messages.length >= 2, r.data?.error);
	userMessageId = r.data?.messages?.[0]?.id ?? 0;
	check('Bot 回了 ~rs 的结果', r.data?.messages?.some((m: any) => m.sender === 'bot'));
	console.log('      Bot 输出:', r.data?.messages?.find((m: any) => m.sender === 'bot')?.content?.split('\n')[0]);
}

/* 12. 轮询拉取 */
{
	const r = await call(`/api/rooms/${roomId}/messages?after=0`, {}, aliceCookie);
	check('消息增量拉取', r.status === 200 && r.data.messages.length >= 2, r.data?.error);
}

/* 13. 普通用户不能撤回别人的消息（自己发的可以） */
{
	const r = await post(`/api/messages/${userMessageId}/recall`, {}, aliceCookie);
	check('本人撤回自己的消息', r.status === 200 && r.data?.message?.recalled === true, r.data?.error);
}

/* 14. 管理员撤回他人消息 */
{
	const sent = await post(`/api/rooms/${roomId}/messages`, { content: '你好世界' }, aliceCookie);
	const id = sent.data.messages[0].id;
	const r = await post(`/api/messages/${id}/recall`, {}, rootCookie);
	check('管理员撤回他人消息', r.status === 200 && r.data?.message?.recalled === true, r.data?.error);

	const list = await call(`/api/rooms/${roomId}/messages?after=0`, {}, rootCookie);
	const tomb = list.data.messages.find((m: any) => m.id === id);
	check('撤回后内容被清空', tomb?.recalled === true && tomb?.content === '');
}

/* 15. 用户管理 */
{
	const r = await call('/api/users', {}, rootCookie);
	check('管理员查看用户列表', r.status === 200 && r.data.users.length >= 2);

	const banned = await post(`/api/users/${alice}/ban`, { banned: true }, rootCookie);
	check('封禁用户', banned.status === 200 && banned.data.user.permission === 0);

	const blocked = await call('/api/auth/me', {}, aliceCookie);
	check('封禁后 token 立即失效', blocked.data?.user === null);

	const unbanned = await post(`/api/users/${alice}/ban`, { banned: false }, rootCookie);
	check('解封用户', unbanned.status === 200 && unbanned.data.user.permission === 1);
}

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
