import { browser } from '$app/environment';
import { _, addMessages, init, locale as localeStore } from 'svelte-i18n';
import { derived, type Readable } from 'svelte/store';
import type { I18nMapping } from './i18n-types';
import en from './locales/en.yaml';
import zhHans from './locales/zh-hans.yaml';
import zhHant from './locales/zh-hant.yaml';

export type Locale = 'zh-hans' | 'zh-hant' | 'en';

export const SUPPORTED_LOCALES: { value: Locale; label: string }[] = [
	{ value: 'zh-hans', label: '简体中文' },
	{ value: 'zh-hant', label: '繁體中文' },
	{ value: 'en', label: 'English' }
];

const DEFAULT_LOCALE: Locale = 'zh-hans';
const STORAGE_KEY = 'rsgame.locale';

/** locales 目前是两层结构（命名空间 → 键 → 文案），正好对应 svelte-i18n 的点号路径查找 */
type Dictionary = Record<string, Record<string, string>>;

addMessages('zh-hans', zhHans as unknown as Dictionary);
addMessages('zh-hant', zhHant as unknown as Dictionary);
addMessages('en', en as unknown as Dictionary);

function isLocale(value: unknown): value is Locale {
	return value === 'zh-hans' || value === 'zh-hant' || value === 'en';
}

function detectLocale(): Locale {
	if (!browser) return DEFAULT_LOCALE;

	const saved = localStorage.getItem(STORAGE_KEY);
	if (isLocale(saved)) return saved;

	const nav = (navigator.language || '').toLowerCase();
	if (nav.startsWith('zh')) {
		return /hant|tw|hk|mo/.test(nav) ? 'zh-hant' : 'zh-hans';
	}
	return nav.startsWith('en') ? 'en' : DEFAULT_LOCALE;
}

init({ fallbackLocale: DEFAULT_LOCALE, initialLocale: detectLocale() });

if (browser) {
	localeStore.subscribe((value) => {
		if (isLocale(value)) localStorage.setItem(STORAGE_KEY, value);
	});
}

export const locale = localeStore;

export function setLocale(next: Locale): void {
	localeStore.set(next);
}

/* ---------------- 类型安全的 t ---------------- */

type Key = keyof I18nMapping;

/** 该键在文案里声明过的占位符 → 必须传入的取值 */
type Values<K extends Key> = Record<Extract<I18nMapping[K], string>, string | number>;

export type TFunction = <K extends Key>(key: K, values?: Values<K>) => string;

/**
 * 用法：`<p>{$t('nav.rooms')}</p>`、`{$t('rooms.meta', { id, owner, count })}`
 * 是 derived store，切换语言时整站自动重渲染。
 */
export const t: Readable<TFunction> = derived(_, ($_) => {
	return ((key: string, values?: Record<string, string | number>) =>
		$_(key, { values })) as TFunction;
});

export type { I18nMapping };
