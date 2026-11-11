import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// 纯 SPA：所有页面都打包成静态资源，不产生任何服务端路由
		adapter: adapter({ fallback: 'index.html', strict: false })
	}
};
