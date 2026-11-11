import { purgeExpiredMessages } from '../../src/api/lib/messages';

/** 每天清理一次超过 7 天保留期的消息 */
export const config = {
	schedule: '@daily'
};

export default async function handler(): Promise<Response> {
	const deleted = await purgeExpiredMessages();
	console.log(`[cleanup] 已删除 ${deleted} 条过期消息`);
	return new Response(`deleted ${deleted}`, { status: 200 });
}
