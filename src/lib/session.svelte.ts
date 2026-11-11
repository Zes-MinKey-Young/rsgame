import { api } from './api';
import type { User } from './types';

class SessionStore {
	user = $state<User | null>(null);
	loading = $state(true);

	async refresh(): Promise<void> {
		try {
			const data = await api.get<{ user: User | null }>('/auth/me');
			this.user = data.user;
		} catch {
			this.user = null;
		} finally {
			this.loading = false;
		}
	}

	async login(username: string, password: string): Promise<void> {
		const data = await api.post<{ user: User }>('/auth/login', { username, password });
		this.user = data.user;
	}

	async register(input: {
		inviteCode: string;
		username: string;
		password: string;
		displayName?: string;
	}): Promise<void> {
		const data = await api.post<{ user: User }>('/auth/register', input);
		this.user = data.user;
	}

	async logout(): Promise<void> {
		await api.post('/auth/logout');
		this.user = null;
	}

	setUser(user: User): void {
		this.user = user;
	}
}

export const session = new SessionStore();
