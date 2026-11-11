import { sveltekit } from '@sveltejs/kit/vite';
import { load } from 'js-yaml';
import { defineConfig, type Plugin } from 'vite';

/**
 * 把 .yaml 直接当 ES 模块引入，构建期转成对象，运行时不带 YAML 解析器。
 */
function yamlPlugin(): Plugin {
	return {
		name: 'rsgame:yaml',
		enforce: 'pre',
		transform(code, id) {
			// Vite 传给 transform 的 id 会带查询串（如 `?import`），先剥掉
			const file = id.split('?')[0];
			if (!file.endsWith('.yaml') && !file.endsWith('.yml')) return null;
			const data = load(code);
			return { code: `export default ${JSON.stringify(data)};`, map: null };
		}
	};
}

export default defineConfig({
	plugins: [yamlPlugin(), sveltekit()],
	server: {
		port: 5173,
		proxy: {
			// 本地开发时把 /api 转发给 src/dev.ts 起的 Hono 服务
			'/api': {
				target: 'http://127.0.0.1:8787',
				changeOrigin: false
			}
		}
	}
});
