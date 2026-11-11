import {mw, localStorage} from "./polyfill";

const KEY = 'rswiki:NavLevel-data'
const LEVEL_KEY = 'rswiki:NavLevel-levels'
const DIFFICULTY_KEY = 'rswiki:NavLevel-difficulty';
const EXPIRY_KEY = 'rswiki:NavLevel-expiry'
const OPTIONS_KEY = 'rswiki:NavLevel-options'
const REJECT_THRESHOLD = 210; // 当前有218个非饭制关卡，如果钻取到的数据低于210，则认为数据无效，使用旧数据
const EXPIRY_SECS = 3600 * 12;
const EXPIRY_MS = EXPIRY_SECS * 1000;

// 禁用所有过期重取，设置为 true 以启用
const DISABLE_EXPIRY_REFRESH = true;

const ORIGIN = "https://rs.miraheze.org/";

const REL_SEP = "、";



export async function getData(): Promise<LevelEntry[] | null> {
    const dataJson = localStorage.getItem(KEY);
    let data: LevelEntry[];
    try {
        if (!dataJson) {
            throw new Error('No data');
        }
        data = JSON.parse(dataJson);
    } catch (e) {
    }
    return data;
}


export async function fetchLevels(): Promise<string[] | null> {
    const res = await fetch(ORIGIN + "wiki/Module:NavLevel/levels?action=raw");
    if (!res.ok) {
        return null;
    }
    const text = await res.text();
    const intoJSON = text
        .replace(/^return\s+/, "")
        .replace(/\{/g, "[")
        .replace(/\}/g, "]")
        .replace(/\-\-.*?\n/g, "");
    try {
        return JSON.parse(intoJSON);
    } catch (e) {
        return null;
    }
}

// 可信的关卡列表
// 从Module:NavLevel/levels中获取
// 这个Lua文件不应当包含复杂的语法，只有一个return扁平数组的语句
export async function getValidLevels(): Promise<string[] | null> {
    let levels = mw.storage.getObject(LEVEL_KEY);
    if (levels) {
        return levels;
    }
    // levels = await fetchLevels();
    // mw.storage.setObject(LEVEL_KEY, levels, DISABLE_EXPIRY_REFRESH ? 0 : EXPIRY_SECS);
    // return levels;
}

export async function fetchDifficulty(): Promise<DiffcultyData | null> {
    const res = await fetch(ORIGIN + "wiki/Module:Difficulty/data.json?action=raw");
    if (!res.ok) {
        return null;
    }
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

export async function getDifficulty(): Promise<DiffcultyData | null> {
    let difficulty = mw.storage.getObject(DIFFICULTY_KEY);

    if (difficulty) {
        return difficulty;
    }

    // difficulty = await fetchDifficulty();
    // mw.storage.setObject(DIFFICULTY_KEY, difficulty, DISABLE_EXPIRY_REFRESH ? 0 : EXPIRY_SECS);
    // return difficulty;
}


export interface Options {
    grouping1: string;
    grouping2: string;
    sortingPriority: string[];
    direction: string;
    showsBirthday: boolean;
    followsMain: boolean;
}

export type DiffcultyData = {
    [key: string]: [number, number] | [[number, number, string], [number, number, string]]
}


export interface LevelEntry {
    /** 带繁简转换的中文名 */
    name: string;

    en: string;
    /** 别称 */
    alias: string[];
    /** 序号 */
    num: number;
    versyb: string;
    /** 页面名 */
    page: string;
    /** 星数 */
    stars: number;
    /** 类型 */
    type: "共创" | "官方" | "活动" | "饭制";
    /** 首次出现版本 */
    inVer: string;
    /** 移除版本 */
    remVer: string;
    /** 恢复版本 */
    resVer: string;
    /** 首次出现版本的发布日期 */
    inDate: string;
    /** 奖励方式 */
    award: "none" | "crown" | "present";
    /** 钻石数 */
    dia: number;
    /** 关卡的相关关卡列表，可能为空 */
    rel: string[];

    authors: string[];
    songType: string[];
}