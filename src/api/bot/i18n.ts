// 原版是 Bun 专有的 `import ... with { type: "yaml" }`，打包到 Node 需要改成 JSON。
// 内容由 i18n.yaml 一比一转换而来（scripts/yaml2json.ts）。
import rawLocales from './i18n.json';

const locales = rawLocales as unknown as Record<string, Record<string, string>>;

let locale: 'zh-hans' | 'zh-hant' | 'en' = 'zh-hans';

export function setLocale(l: 'zh-hans' | 'zh-hant' | 'en') {
	locale = l;
}

export function i18n(obj: { hans: string; hant: string; en: string }) {
	return obj[locale];
}

export function _(key: string, ...args: string[]) {
	let i = 0;
	return locales[key][locale].replaceAll(/%s/g, () => {
		return args?.[i++];
	});
}
