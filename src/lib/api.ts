export class ApiError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		credentials: 'include',
		...init,
		headers: {
			...(init?.body ? { 'Content-Type': 'application/json' } : {}),
			...init?.headers
		}
	});

	const text = await res.text();
	const data = text ? (JSON.parse(text) as unknown) : null;

	if (!res.ok) {
		const message =
			data && typeof data === 'object' && 'error' in data
				? String((data as { error: unknown }).error)
				: `请求失败 (${res.status})`;
		throw new ApiError(message, res.status);
	}

	return data as T;
}

export const api = {
	get<T>(path: string): Promise<T> {
		return request<T>(path);
	},
	post<T>(path: string, body?: unknown): Promise<T> {
		return request<T>(path, {
			method: 'POST',
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	}
};
