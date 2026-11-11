export const Permission = {
	TALK: 0b0000001,
	BAN: 0b0000100,
	DELETE: 0b0010000,
	ROOT: 0b1000000
} as const;

export function has(perm: number, required: number): boolean {
	return (perm & required) === required;
}

export function canOpenRoom(perm: number): boolean {
	return has(perm, Permission.BAN) || has(perm, Permission.ROOT);
}

export function canBan(perm: number): boolean {
	return has(perm, Permission.BAN) || has(perm, Permission.ROOT);
}

export function canSetPermission(perm: number): boolean {
	return has(perm, Permission.DELETE) || has(perm, Permission.ROOT);
}

export function canDeleteUser(perm: number): boolean {
	return has(perm, Permission.ROOT);
}

export function canRecallAny(perm: number): boolean {
	return has(perm, Permission.DELETE) || has(perm, Permission.ROOT);
}

export function canInvite(perm: number): boolean {
	return has(perm, Permission.ROOT);
}

/** 权限位 → i18n 键，交给调用方用 $t 渲染 */
export type RoleKey =
	| 'role.root'
	| 'role.manage'
	| 'role.mod'
	| 'role.user'
	| 'role.banned'
	| 'role.none';

export function permissionKey(perm: number): RoleKey {
	if (perm === 0) return 'role.banned';
	if (has(perm, Permission.ROOT)) return 'role.root';
	if (has(perm, Permission.DELETE)) return 'role.manage';
	if (has(perm, Permission.BAN)) return 'role.mod';
	if (has(perm, Permission.TALK)) return 'role.user';
	return 'role.none';
}

/** 权限位 → 可选项列表（管理页下拉用） */
export function permissionChoices(): { value: number; key: RoleKey }[] {
	return [
		{ value: Permission.TALK, key: 'role.user' },
		{ value: Permission.TALK | Permission.BAN, key: 'role.mod' },
		{ value: Permission.TALK | Permission.DELETE, key: 'role.manage' },
		{ value: Permission.TALK | Permission.ROOT, key: 'role.root' },
		{ value: 0, key: 'role.banned' }
	];
}
