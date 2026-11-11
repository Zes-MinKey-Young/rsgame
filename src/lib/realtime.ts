/**
 * 2 秒短轮询。Netlify 上没有常驻 WebSocket，轮询是最稳的方案。
 * 页面不可见时自动跳过请求，避免白烧函数调用次数。
 */
export function startPolling(
	tick: () => Promise<void> | void,
	intervalMs = 2000
): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const loop = async () => {
		if (stopped) return;
		if (!document.hidden) {
			try {
				await tick();
			} catch (err) {
				console.warn('[poll] 拉取失败', err);
			}
		}
		if (stopped) return;
		timer = setTimeout(loop, intervalMs);
	};

	void loop();

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
