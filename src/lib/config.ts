/**
 * 部署者可在构建时通过 PUBLIC_OPERATOR 环境变量填写运营主体名称。
 * 未填写时，服务条款里会显式展示「由部署者填写」的占位文案。
 */
export const OPERATOR: string =
	((import.meta.env.PUBLIC_OPERATOR as string | undefined) ?? '').trim();

/** 服务条款的修订日期，修改条款内容时同步更新 */
export const TOS_VERSION = '2026-11';
