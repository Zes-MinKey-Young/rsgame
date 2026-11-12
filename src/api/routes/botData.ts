import { Hono, type Context } from 'hono';
import { botDataStatus, saveBotData, validateBotData } from '../bot/data-store';
import { requireUser, type SafeUser } from '../lib/auth';
import { fail, readJson } from '../lib/http';
import { Permission, has } from '../lib/perm';

export const botDataRoutes = new Hono();

/** 只有超级管理员可以查看/替换关卡数据 */
async function requireRoot(c: Context): Promise<SafeUser> {
	const user = await requireUser(c);
	if (!has(user.permission, Permission.ROOT)) {
		fail(403, '只有超级管理员可以管理关卡数据');
	}
	return user;
}

botDataRoutes.get('/', async (c) => {
	await requireRoot(c);
	return c.json({ status: botDataStatus() });
});

botDataRoutes.post('/', async (c) => {
	const user = await requireRoot(c);

	const body = await readJson(c);

	let map;
	try {
		map = validateBotData(body);
	} catch (err) {
		fail(400, (err as Error).message);
	}

	const status = await saveBotData(map, user.username);
	return c.json({ status });
});
