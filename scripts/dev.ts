/**
 * 一条命令同时起 API（8787）和前端（5173）。
 * 用 Bun.spawn 而不是 `bun run --parallel`，跨平台更可靠。
 */
const children = [
	Bun.spawn(['bun', '--watch', 'src/dev.ts'], { stdout: 'inherit', stderr: 'inherit' }),
	Bun.spawn(['bun', 'run', 'dev:web'], { stdout: 'inherit', stderr: 'inherit' })
];

let closing = false;

function shutdown(code = 0): void {
	if (closing) return;
	closing = true;
	for (const child of children) {
		try {
			child.kill();
		} catch {
			/* 已退出 */
		}
	}
	process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] API  → http://127.0.0.1:8787');
console.log('[dev] Web  → http://localhost:5173');
console.log('[dev] Ctrl+C 退出');

const exited = await Promise.race(children.map((child) => child.exited));
shutdown(exited ?? 0);
