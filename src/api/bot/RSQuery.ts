// 原版从 node-napcat-ts 取 GroupMessage，新项目不依赖该包，改用 bot.ts 里的同构类型
import type { GroupMessage } from "./bot";
import { Bot, whitespaceArgParse, type CommandRule } from "./bot";
import { getData, getDifficulty, type DiffcultyData, type LevelEntry } from "./data";
import { _ } from "./i18n";
// serverless 环境没有可读的运行时文件系统，别名表改为打包时内联
import aliasFile from "./alias.json";

let userAliases: Record<string, string>;
try {
    const parsed = aliasFile as unknown as Record<string, string>;
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid JSON");
    }
    userAliases = parsed;
} catch (e) {
    userAliases = {};
}

const basic = {
    "斜角悲": "世界杯",
    "解未": "解锁未来",
    "TSR": "The Spectre Remix",
    "外卖": "绝密实验室",
    "外卖实验室": "绝密实验室",
    "斜角屋": "魔法屋",
    "妙妙屋": "奇妙甜品屋",
    "米奇妙妙屋": "奇妙甜品屋",
    "落日贱种": "落日剑冢",
    "Alone2": "Alone II",
    "A2": "Alone II",
    "锎锌": "开心",
    "开心病": "开心",
    "惊险原神": "阱陷渊深",
    "惊现原神": "阱陷渊深",
}

const aliases = Object.assign(Object.create(basic), userAliases);

function formatDifficulty(difficulty: DiffcultyData[string]) {
    if (Array.isArray(difficulty[0])) {
        return difficulty.map(diff => `${diff[0].toFixed(1)}/${diff[1].toFixed(1)} (${diff[2]})`).join("\n");
    } else {
        // @ts-expect-error
        return `${difficulty[0].toFixed(1)}/${difficulty[1].toFixed(1)}`;
    }
}

export enum ResultType {
    MATCHED,
    NONE,
    TOO_FUZZY,
    ERROR
}

interface QueryEntry {
    repr: LevelEntry;
    redirect: string[];
}

interface HasResult {
    flag: ResultType.MATCHED;
    entries: QueryEntry[];
}

interface NoResult {
    flag: ResultType.NONE;
}

interface TooFuzzy {
    flag: ResultType.TOO_FUZZY;
    entries: LevelEntry[];
    // redirect: string[][];
}

interface QueryError {
    flag: ResultType.ERROR;
    message: string;
}

type Result = HasResult | NoResult | TooFuzzy | QueryError;

export function searchLevel(data: LevelEntry[], level: string): Result {
    
    let m;
    const predicateForNumber =
        level.match(/^\d+$/)
            ? entry => entry.num === parseInt(level)
        : (m = level.match(/^(?:Lv\.?|官方?)\s*?([1-9]\d*)$/))
            ? entry => entry.num === parseInt(m[1]) && entry.type === '官方'
        : (m = level.match(/^(?:Co[Ll]?\.?|共创?)\s*?([1-9]\d*)$/))
            ? entry => entry.num === parseInt(m[1]) && entry.type === '共创'
        : (m = level.match(/^(?:Sp\.?|Ev\.?|活动?)\s*?([1-9]\d*)$/))
            ? entry => entry.num === parseInt(m[1]) && entry.type === '活动'
            : null;

    if (predicateForNumber) {
        const levels = data.filter(predicateForNumber);
        if (levels.length === 0) {
            return {
                flag: ResultType.ERROR,
                message: "RS没有这么多关卡呢"
            }
        } else {
            return {
                flag: ResultType.MATCHED,
                entries: levels.map(level => ({ repr: level, redirect: [] }))
            }
        }
    }
    if (level.endsWith("奖励") || level.endsWith("主线")
    || level.endsWith("支线") || level.endsWith("奖励关") || level.endsWith("主线关")
    || level.endsWith("伴生") || level.endsWith("伴生关")) {
            
        const resultArr: QueryEntry[] = []
        const isBonus = level.endsWith("奖励") || level.endsWith("奖励关") || level.endsWith("支线");
        const isAnotherVer = level.endsWith("伴生") || level.endsWith("伴生关");
        const res = searchLevel(data, level.slice(0, level.endsWith("关") ? -3 : -2));
        if (res.flag !== ResultType.MATCHED) {
            return res;
        }
        const entries = res.entries;
        for (const entry of entries) {
            const possessive = entry.repr;
            const redirect = entry.redirect;
            
            if (!possessive.rel || !possessive.rel.length) {
                continue;
            }
            const relEntries = possessive.rel.map(rel => data.find(entry => entry.page === rel));
            
            const relateds = relEntries.filter(relEntry => {
                if (relEntry.type !== possessive.type) {
                    return false;
                }
                if (isAnotherVer && relEntry.num === possessive.num) {
                    return true;
                }
                else if (isBonus ? relEntry.num > possessive.num : relEntry.num < possessive.num) {
                    return true;
                }
            });
            if (relateds) {
                for (const related of relateds) {
                    const rdr = [...redirect];
                    resultArr.push({repr: related, redirect: rdr});
                    rdr.push(`[${level} -> ${related.page}]`)
                }
            }
        }
        return resultArr.length === 0 ? { flag: ResultType.NONE } : { flag: ResultType.MATCHED, entries: resultArr };
    }
    const exact = data.find(entry => entry.page === level || entry.en.toLowerCase() === level.toLowerCase());
    if (exact) {
        return {
            flag: ResultType.MATCHED,
            entries: [{ repr: exact, redirect: [] }]
        };
    }
    const aliasResult = aliases[level]
        ? data.find(entry => entry.page === aliases[level])
        : data.find(entry => entry.alias.includes(level));
    if (aliasResult) {
        return {
            flag: ResultType.MATCHED,
            entries: [{ repr: aliasResult, redirect: [`[${level} -> ${aliasResult.page}]`] }]
        };
    }
    if (level === "") {
        return {
            flag: ResultType.ERROR,
            message: "你搜滚木呢！"
        }
    }
    if (level.length === 1) {
        return {
            flag: ResultType.ERROR,
            message: "一个字符怎么找得到嘛！哦对，除了“云”。"
        }
    }
    let fuzzy = data.filter(entry => [...level].every(char => entry.page.includes(char)));
    if (!fuzzy.length) {
        fuzzy = data.filter(entry => {
            const en = entry.en.toLowerCase();
            const enWords = en.split(' ');
            const words = level.toLowerCase().split(' ');
            return words.every(word => enWords.includes(word));
        });
    }
    if (fuzzy) {
        if (fuzzy.length > 3) {
            return {
                flag: ResultType.TOO_FUZZY,
                entries: fuzzy
            };
        } else if (fuzzy.length === 0) {
            return {
                flag: ResultType.NONE
            }
        } else {
            return {
                flag: ResultType.MATCHED,
                entries: fuzzy.map(entry => ({
                    repr: entry,
                    redirect: [`[${level} -> ${entry.page}]`]
                }))
            }
        }
    }

    return null;
}

const prefixes = {
    "官方": "Lv.",
    "共创": "Co.",
    "活动": "Sp.",
    "饭制": "Fan."
}

export function genText(entry: LevelEntry, difficulty: DiffcultyData, redirect: string = "") {
    const difficultyEntry = difficulty[entry.page];
    return `${redirect ? redirect + "\n" : ""}${entry.page} ${entry.page !== entry.en ? entry.en + " " : ""}${prefixes[entry.type]}${entry.num}${entry.versyb ? "[" + entry.versyb + "]" : ""} ${(entry.type === "活动" ? "😃" : "☆").repeat(entry.stars)}
${difficultyEntry && difficultyEntry[0] ? formatDifficulty(difficultyEntry) : ""}
${entry.award === "crown" ? "3👑" : entry.award === "present" ? "10🎁" : ""}${entry.dia}💎
${entry.songType?.join?.("/") || _("rs-unknown-style")} ${entry.authors?.length ? `by ${entry.authors.join("&")}` : ""}
${_("rs-add", entry.inVer, entry.inDate)}`
+ (entry.remVer ? "\n" + _("rs-removed", entry.remVer) : "")
+ (entry.resVer ? "\n" + _("rs-restored", entry.resVer) : "")
}
function genTexts(entry: LevelEntry[], difficulty: DiffcultyData, redirect: string = "") {
    return entry.map(e => genText(e, difficulty, redirect)).join("\n\n");
}
function processEntry(bot: Bot, context: GroupMessage, entries: LevelEntry[], difficulty: DiffcultyData, redirect: string = "") {
    bot.sendText(context, genTexts(entries, difficulty, redirect)); 
}


function checkValidity(text: string) {
    return !(text.includes("'") || text.includes("，"))
    && [...text].every(c => {
        const cp = c.charCodeAt(0);
        return cp >= 32 && cp <= 127 || cp >= 0x4E00 && cp <= 0x9FA5 || cp === 183;
    });
}



export default {
    name: "rs",
    async handler(bot, context, text) {
        if (!checkValidity(text.slice(1))) {
            bot.sendText(context, _("rs-dont-abuse", context.user_id));
            return;
        }
        const original = text.slice(4).trim();
        let level = original;
        if (level === "") {
            return "help" as const;
        }
        if (level.startsWith("-") || level === "0") {
            bot.sendText(context, _("rs-integer-num"));
            return;
        }

        const data = await getData();
        const difficulty = await getDifficulty();
        const res = searchLevel(data, level);
        console.log(res);
        switch (res.flag) {
            case ResultType.MATCHED:
                if (res.entries.some(entry => entry.redirect.length > 3)) {
                    bot.sendText(context, _("rs-dont-abuse-2"));
                    return;
                }
                bot.sendText(context, res.entries.map(entry => genText(
                    entry.repr,
                    difficulty,
                    entry.redirect.join("\n")
                )).join("\n\n"));
                return;
            case ResultType.TOO_FUZZY:
                bot.sendText(context, _("rs-too-many-levels", level) + res.entries.map(entry => entry.page).join("、"));
                return;
            case ResultType.ERROR:
                bot.sendText(context, res.message);
                return;
            case ResultType.NONE:
                bot.sendText(context, _("rs-cant-find", original));
                return;
        }
    },
    help: _("rs-query-help")

} satisfies CommandRule;

const addAlias = async (alias: string, name: string) => {

            aliases[alias] = name;
            userAliases[alias] = name;
    // 原版会写回 alias.json；serverless 无持久文件系统，仅保留内存写入
}

const ZES = 2149291470;

const deniedAliases: { alias: string; time: number }[] = [];
const DENY_CD = 10 * 60 * 1000;

// export const AddAlias: CommandRule = {
//     name: "rsalias",
//     help: "添加关卡别名，用法：~rsalias <关卡名称> <别名>。添加时需要得到3个大拇指的回应，收到任何非大拇指的回应都将直接失败。Bot主人不受限制。",
//     handler: async (bot, message, text) => {
//         const params = whitespaceArgParse(text);
//         if (params.length !== 3) {
//             return void await bot.sendText(message, "参数错误，请检查输入。");
//         }
//         const [_, name, alias] = params;
//         const data = await getData();
//         const entry = data.find(entry => entry.page === name);
//         if (!entry) {
//             return void await bot.sendText(message, "数据中没有找到关卡" + name);
//         }
//         if (data.find(entry => entry.page === alias)) {
//             return void await bot.sendText(message, alias + "是已有关卡的名字");
//         }
//         if (entry.alias.includes(alias) || alias in aliases) {
//             return void await bot.sendText(message, "别名中已经存在" + alias);
//         }
//         if (message.user_id === ZES) {
//             await addAlias(alias, name);
//             return void await bot.sendText(message, "您是Bot作者，免去投票，添加成功！");
//         } else {
//             if (deniedAliases.some(denied => denied.alias === alias && Date.now() - denied.time < DENY_CD)) {
//                 return void await bot.sendText(message, "该别名刚被否决过，请不要频繁请求。")
//             }
//             await bot.sendText(message, "↑请群成员对上条消息使用回应功能投票，需要三个大拇指（是QQ表情而非emoji），有任何非大拇指将直接失败。");
//             let voteCount = 0;
//             while (voteCount < 3) {
//                 const reaction = await bot.requireReactionTo(message.message_id);
//                 if (!(reaction as any).is_add) {
//                     if (reaction.likes[0].emoji_id === "76") {
//                         voteCount--;
//                         continue;
//                     }
//                 }
//                 if (reaction.likes[0].emoji_id === "76") {
//                     if (reaction.user_id === ZES) {
//                         voteCount = 3;
//                         break;
//                     }
//                     voteCount++;
//                 } else {
//                     deniedAliases.push({ alias, time: Date.now() });
//                     return void await bot.sendReply(message, "有人发了反对票，添加别名失败。");
//                 }
//             }
//             await addAlias(alias, name);
//             await bot.throttle(message);
//             return void await bot.sendReply(message, "投票通过，添加别名成功。");
//         }
//     }
// }

export const LsAlias: CommandRule = {
    name: "rslsalias",
    help: "列出所有关卡别名",
    handler: async (bot, message, text) => {
        await bot.sendPack(message, Object.entries(aliases).map(([alias, name]) => `${alias} -> ${name}`));
    }
}
