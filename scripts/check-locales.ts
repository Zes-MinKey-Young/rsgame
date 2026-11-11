/**
 * 校验各语言包的键集合与占位符是否一致。
 * 用法：bun run i18n:check
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const DIR = resolve('src/lib/i18n/locales');

function flatten(value: unknown, prefix = ''): Map<string, string> {
	const out = new Map<string, string>();
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			for (const [k, v] of flatten(child, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
		}
	} else if (typeof value === 'string') {
		out.set(prefix, value);
	}
	return out;
}

function placeholders(text: string): string[] {
	return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

const files = (await readdir(DIR)).filter((name) => name.endsWith('.yaml')).sort();
if (files.length === 0) {
	console.error('没有找到语言包');
	process.exit(1);
}

const dicts = new Map<string, Map<string, string>>();
for (const file of files) {
	const source = await readFile(resolve(DIR, file), 'utf-8');
	dicts.set(file, flatten(load(source)));
}

const baseFile = files[0];
const base = dicts.get(baseFile)!;
let problems = 0;

for (const [file, dict] of dicts) {
	if (file === baseFile) continue;

	for (const key of base.keys()) {
		if (!dict.has(key)) {
			console.error(`✗ ${file} 缺少键：${key}`);
			problems += 1;
		}
	}
	for (const key of dict.keys()) {
		if (!base.has(key)) {
			console.error(`✗ ${file} 多出键：${key}（${baseFile} 中不存在）`);
			problems += 1;
		}
	}
}

for (const [key, text] of base) {
	const expected = placeholders(text).join(',');
	for (const [file, dict] of dicts) {
		const other = dict.get(key);
		if (other === undefined) continue;
		const actual = placeholders(other).join(',');
		if (expected !== actual) {
			console.error(`✗ ${file} 的 ${key} 占位符不一致：期望 [${expected}]，实际 [${actual}]`);
			problems += 1;
		}
	}
}

if (problems > 0) {
	console.error(`\n共 ${problems} 处不一致`);
	process.exit(1);
}

console.log(`✓ ${files.length} 个语言包一致，共 ${base.size} 个键`);
