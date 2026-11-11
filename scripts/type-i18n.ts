/**
 * 从 locales/zh-hans.yaml 生成 I18nMapping 类型。
 * 改编自 kipphi-apparatus 的 apps/desktop/scripts/type-i18n.ts，
 * 输入从 JSON 换成 YAML，输出改成 TS 模块。
 *
 * 用法：
 *   bun run i18n:types
 *   bun run i18n:watch
 */
import { readFile, watch, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const INPUT = resolve('src/lib/i18n/locales/zh-hans.yaml');
const OUTPUT = resolve('src/lib/i18n/i18n-types.ts');

/** 递归提取所有键路径，以及每个值里用到的占位符名 */
function extractKeys(value: unknown, prefix = ''): Record<string, string[]> {
	let keys: Record<string, string[]> = {};

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;
			keys = Object.assign(keys, extractKeys(child, fullKey));
		}
		return keys;
	}

	if (typeof value === 'string') {
		keys[prefix] = [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
	} else {
		keys[prefix] = [];
	}

	return keys;
}

function generateTypeDefinitions(keyMapping: Record<string, string[]>): string {
	const entries = Object.entries(keyMapping)
		.map(([key, placeholders]) => {
			const union = placeholders.length > 0 ? placeholders.map((name) => `"${name}"`).join(' | ') : 'never';
			return `\t"${key}": ${union};`;
		})
		.join('\n');

	return `// 由 scripts/type-i18n.ts 从 locales/zh-hans.yaml 自动生成
// 请勿手动修改，改动请执行 bun run i18n:types

export interface I18nMapping {
${entries}
}
`;
}

async function main(): Promise<void> {
	try {
		const source = await readFile(INPUT, 'utf-8');
		const json = load(source) as Record<string, unknown>;
		const keyMapping = extractKeys(json);

		await writeFile(OUTPUT, generateTypeDefinitions(keyMapping), 'utf-8');
		console.log(`[type-i18n] 已生成 ${OUTPUT}，共 ${Object.keys(keyMapping).length} 个键`);
	} catch (error) {
		console.error('[type-i18n] 生成失败:', (error as Error).message);
		process.exit(1);
	}
}

await main();

if (process.argv.includes('--watch')) {
	let lastRun = performance.now();
	const watcher = watch('src/lib/i18n/locales');
	for await (const _event of watcher) {
		if (performance.now() - lastRun < 300) continue;
		lastRun = performance.now();
		await main();
	}
}
