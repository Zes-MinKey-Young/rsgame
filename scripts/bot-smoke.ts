/**
 * Bot 冒烟测试：不依赖数据库，直接验证移植过来的游戏层能跑通回放。
 * 用法：bun run scripts/bot-smoke.ts
 */
import { Bot, SuspendSignal, withSeededRandom } from '../src/api/bot/bot';
import type { BotOutput, CommandRule, GroupMessage } from '../src/api/bot/bot';
import rsQuery from '../src/api/bot/RSQuery';
import rsList, { RSHGT } from '../src/api/bot/RSList';

const RULES: CommandRule[] = [rsQuery as CommandRule, rsList as CommandRule, RSHGT];

async function replay(
	command: string,
	text: string,
	trigger: GroupMessage,
	transcript: GroupMessage[],
	seed: number
): Promise<{ outputs: BotOutput[]; suspended: boolean }> {
	const bot = new Bot(transcript);
	await bot.init();
	for (const rule of RULES) bot.registerCommand(rule);

	const rule = bot.commands.find((c) => c.name === command);
	if (!rule) return { outputs: [], suspended: false };

	let suspended = false;
	await withSeededRandom(seed, async () => {
		try {
			const res = await rule.handler(bot, trigger, text);
			if (res === 'help') bot.sendText(trigger, rule.help);
		} catch (err) {
			if (err instanceof SuspendSignal) suspended = true;
			else throw err;
		}
	});
	return { outputs: [...bot.outputs], suspended };
}

let failed = 0;
function check(name: string, ok: boolean, extra = '') {
	console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? ' :: ' + extra : ''}`);
	if (!ok) failed += 1;
}

const base = { group_id: 'g1', user_id: 'tester', at: ['bot'] };

/* 1. ~rs 单关查询 */
{
	const trigger: GroupMessage = { ...base, content: '~rs 1' };
	const r = await replay('rs', '~rs 1', trigger, [], 1);
	check('~rs 1 有输出', r.outputs.length > 0);
	check('~rs 1 未挂起', r.suspended === false);
	console.log('      输出首行:', r.outputs[0]?.text.split('\n')[0]);
}

/* 2. ~rs 越界序号 */
{
	const trigger: GroupMessage = { ...base, content: '~rs 9999' };
	const r = await replay('rs', '~rs 9999', trigger, [], 1);
	check('~rs 9999 返回提示而非报错', r.outputs.length > 0, r.outputs[0]?.text);
}

/* 3. ~help */
{
	const trigger: GroupMessage = { ...base, content: '~help' };
	const r = await replay('help', '~help', trigger, [], 1);
	check('~help 有输出', r.outputs.length > 0);
	check('~help 列出了 rs 命令', r.outputs.some((o) => o.text.includes('~rs')));
}

/* 4. ~rshgt 开局 → 应挂起 */
const seed = 12345;
let started;
{
	const trigger: GroupMessage = { ...base, content: '~rshgt' };
	started = await replay('rshgt', '~rshgt', trigger, [], seed);
	check('~rshgt 开局挂起', started.suspended === true);
	check('~rshgt 开局有输出', started.outputs.length > 0, started.outputs[0]?.text);
}

/* 5. ~rshgt 答一次条件 → 回放应多产出一条回答 */
{
	const trigger: GroupMessage = { ...base, content: '~rshgt' };
	const transcript: GroupMessage[] = [{ ...base, content: '星级=2' }];
	const r = await replay('rshgt', '~rshgt', trigger, transcript, seed);
	check('回放输出多于开局', r.outputs.length > started.outputs.length, `${started.outputs.length} -> ${r.outputs.length}`);
	const fresh = r.outputs.slice(started.outputs.length);
	check('新增输出是判定结果', fresh.some((o) => /\[\d+\/10\]/.test(o.text)), JSON.stringify(fresh.map((o) => o.text)));
}

/* 6. 回放确定性：相同种子 + 相同转录，输出必须完全一致 */
{
	const trigger: GroupMessage = { ...base, content: '~rshgt' };
	const transcript: GroupMessage[] = [{ ...base, content: '星级=2' }];
	const a = await replay('rshgt', '~rshgt', trigger, transcript, seed);
	const b = await replay('rshgt', '~rshgt', trigger, transcript, seed);
	check(
		'回放确定性',
		JSON.stringify(a.outputs) === JSON.stringify(b.outputs),
		`${a.outputs.length} vs ${b.outputs.length}`
	);
}

/* 7. ~rslist 条件筛选 */
{
	const trigger: GroupMessage = { ...base, content: '~rslist\n类型=饭制' };
	const r = await replay('rslist', '~rslist\n类型=饭制', trigger, [], 1);
	check('~rslist 有输出', r.outputs.length > 0);
	check('~rslist 走 batch 通道', r.outputs.every((o) => o.batch));
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
