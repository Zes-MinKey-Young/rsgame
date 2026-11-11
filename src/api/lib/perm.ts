/**
 * 权限位掩码，与老实现保持一致：
 *   1   TALK    普通用户，可聊天
 *   4   BAN     版主，可封禁/解封、可开房间
 *   16  DELETE  管理，可改权限、可撤回消息
 *   64  ROOT    超级管理员，可删号、可签发邀请码
 *   0           已封禁（不可登录/不可访问任何接口）
 * 2、8、32 刻意留空，便于日后插层
 */
export const Permission = {
	TALK: 0b0000001,
	BAN: 0b0000100,
	DELETE: 0b0010000,
	ROOT: 0b1000000
} as const;

export type PermissionName = keyof typeof Permission;

/** 判断 perm 是否完整包含 required 中的全部位 */
export function has(perm: number, required: number): boolean {
	return (perm & required) === required;
}

/** 封禁语义：permission === 0 */
export function isBanned(perm: number): boolean {
	return perm === 0;
}

/** 是否拥有任一管理位（BAN / DELETE / ROOT） */
export function isStaff(perm: number): boolean {
	return has(perm, Permission.BAN) || has(perm, Permission.DELETE) || has(perm, Permission.ROOT);
}

/** 权限位 → 展示名称 */
export function permissionLabel(perm: number): string {
	if (perm === 0) return '已封禁';
	if (has(perm, Permission.ROOT)) return '超级管理员';
	if (has(perm, Permission.DELETE)) return '管理';
	if (has(perm, Permission.BAN)) return '版主';
	if (has(perm, Permission.TALK)) return '用户';
	return '无权限';
}

/** 合法的权限位取值集合（用于 setPermission 校验） */
export const ALLOWED_PERMISSIONS = [0, 1, 5, 17, 65] as const;

/* ---------- 能力判定：ROOT 隐含全部能力，因此凡涉及管理操作都要额外判 ROOT ---------- */

export function canOpenRoom(perm: number): boolean {
	return has(perm, Permission.BAN) || has(perm, Permission.ROOT);
}

export function canBan(perm: number): boolean {
	return has(perm, Permission.BAN) || has(perm, Permission.ROOT);
}

export function canSetPermission(perm: number): boolean {
	return has(perm, Permission.DELETE) || has(perm, Permission.ROOT);
}

export function canDelete(perm: number): boolean {
	return has(perm, Permission.ROOT);
}

export function canRecallAny(perm: number): boolean {
	return has(perm, Permission.DELETE) || has(perm, Permission.ROOT);
}

export function canInvite(perm: number): boolean {
	return has(perm, Permission.ROOT);
}
