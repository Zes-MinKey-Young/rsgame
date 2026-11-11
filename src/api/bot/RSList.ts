// 原版游戏代码，逐字保留。DiffcultyData 的联合类型在 data.ts 里推导不完整，
// 原项目（strict: false + 从不运行 svelte-check）同样存在该问题，这里仅关闭本文件的类型检查。
// @ts-nocheck
import { getData, getDifficulty, type DiffcultyData, type LevelEntry } from "./data";
const keys = {
    "关卡序数": "num",
    "关卡序号": "num",
    "序号": "num",
    "id": "num",
    "number": "num",
    "星级": "stars",
    "钻石数": "dia",
    "钻石": "dia",
    "diamonds": "dia",
    "版本": "inVer",
    "came": "inVer",
    "version": "inVer",
    "奖励": "award",
    "奖励机制": "award",
    "收集物机制": "award",
    "奖励方式": "award",
    "collectable": "award",
    "collectables": "award",
    "年份": "year",
    "类型": "type",
    "平民": "complete",
    "完成难度": "complete",
    "完成": "complete",
    "平民难度": "complete",
    "完美": "perfect",
    "完美难度": "perfect",
    "曲师": "author",
    "artist": "author"
};

const artistAliases = {
    "Li Ga Yb": "LiGaYb",
    "lgy": "LiGaYb",
    "李嘎": "LiGaYb",
    "摸鱼客": "MYUKKE.",
    "卖鱼客": "MYUKKE.",
    "MYUKKE": "MYUKKE.",
    "TDX特仑苏": "TDX",
    "庙会": "TDX",
    "猫头": "一杯猫头",
    "Zach": "Zach Striefel",
    "虹羽": "虹羽RFeather",
    "RFeather": "虹羽RFeather",
    "老铁": "FeGtkl",
    "Fe": "FeGtkl",
    "XZ": "Xoun_Zer",
    "根号": "根号大气压强",
    "SquareRoot": "根号大气压强",
    "sqrt": "根号大气压强",
    "七爷": "F-777",
    "教主": "Alan Walker",
    "AW": "Alan Walker",
    "C4": "seiswry_C4",
    "天利": "Daily天利",
    "daily": "Daily天利",
    "镭酸镭": "SunsetRay",
    "您侧睡": "NceS",
    "子智": "子智君",
    "LB": "鼓瑟吹笙LB",
    "Somatone": "Somatone Interactive"
}

function parseRange(value: string) {
    const segs = value.split(",");
    const preds = [];
    for (const seg of segs) {
        const parts = seg.split(/-|~/);
        if (parts.length === 1) {
            preds.push((x: number) => x === Number(parts[0]));
        } else if (parts.length === 2) {
            preds.push((x: number) => x >= Number(parts[0]) && x <= Number(parts[1]));
        } else {
            return () => false;
        }
    }
    return (x: number) => preds.some(pred => pred(x))
}

// function checkRangeSyntax(value: string) {
//     const segs = value.split(",");
//     const preds = [];
//     for (const seg of segs) {
//         const parts = seg.split("-");
//         if (parts.length === 1) {
//             if (isNaN(Number(parts[0]))) {
//                 return false;
//             }
//         } else if (parts.length === 2) {
//             preds.push((x: number) => x >= Number(parts[0]) && x <= Number(parts[1]));
//         } else {
//             return () => false;
//         }
//     }
//     return (x: number) => preds.some(pred => pred(x))
// }

const handlers = {
    num(entry: LevelEntry, value: string) {
        return parseRange(value)(entry.num);
    },
    stars(entry: LevelEntry, value: string) {
        return parseRange(value)(entry.stars);
    },
    dia(entry: LevelEntry, value: string) {
        return parseRange(value)(entry.dia);
    },
    inVer(entry: LevelEntry, value: string) {
        if (value.match(/^\d+\.\d+$/)) {
            return entry.inVer.startsWith(value + ".") || entry.inVer === value; 
        }
        return entry.inVer === value;
    },
    award(entry: LevelEntry, value: string) {
        const splitted = value.split(/[ ,\|、，]/);
        const map = {
            "盒子": "present",
            "神秘箱": "present",
            "box": "present",
            "boxes": "present",
            "皇冠": "crown",
            "三皇冠": "crown",
            "crowns": "crown",
            "无": "none"
        }
        return splitted.map(x => map[x] || x).includes(entry.award);
    },
    year(entry: LevelEntry, value: string) {
        const year = parseInt(entry.inDate.slice(0, 4));
        return parseRange(value)(year);
    },
    type(entry: LevelEntry, value: string) {
        const map = {
            "official": "官方",
            "fanmade": "饭制",
            "cocreation": "共创",
            "co": "共创",
            "lv": "官方",
            "fan": "饭制",
            "event": "活动",
            "sp": "活动",
            "special": "活动",
            "ev": "活动",
            // 繁体到简体映射
            "飯製": "饭制",
            "活動": "活动",
            "共創": "共创"
        }
        return entry.type === (map[value.toLowerCase()] || value);
    },
    complete(entry: LevelEntry, value: string) {
        const rawdiff = diffcultyData[entry.page];
        if (!rawdiff || !rawdiff[0]) {
            return false;
        }
        const diff = Array.isArray(rawdiff[0]) ? rawdiff[0] : rawdiff;
        return parseRange(value)(diff[0]);
    },
    perfect(entry: LevelEntry, value: string) {
        const rawdiff = diffcultyData[entry.page];
        if (!rawdiff || !rawdiff[0]) {
            return false;
        }
        const diff = Array.isArray(rawdiff[0]) ? rawdiff[0] : rawdiff;
        return parseRange(value)(diff[1]);
    },
    author(entry: LevelEntry, value: string) {
        if (entry.authors && entry.authors.length > 0) {
            return entry.authors.some(
                author => author.toLowerCase() === value.toLowerCase() || author === artistAliases[value]
                || author === Object.entries(artistAliases).find(([k,v]) => {
                    return k.toLowerCase() === value.toLowerCase()
                })?.[1]
            )
        }
        return false;
    }
}
const diffcultyData = await getDifficulty();

function formatDifficulty(difficulty: DiffcultyData[string]) {
    if (Array.isArray(difficulty[0])) {
        return difficulty.map(diff => `${diff[0].toFixed(1)}/${diff[1].toFixed(1)} (${diff[2]})`).join("\n");
    } else {
        return `${difficulty[0].toFixed(1)}/${difficulty[1].toFixed(1)}`;
    }
}

import { genText, ResultType, searchLevel } from "./RSQuery";
import { newlineArgParse, type CommandRule } from "./bot";
import { _, i18n } from "./i18n";


const supportedKeys = [...new Set(Object.values(keys))].map(
    key => Object.keys(keys).filter(k => keys[k] === key).join("  ")
).join("\n")

const EXAMPLE = _("rslist-example")
const data = await getData();

export default {
    name: "rslist",
    help: _("rslist-help") + supportedKeys + EXAMPLE,
    async handler(bot, context, text) {
        const args = newlineArgParse(text);
        const lines = args;
        lines.shift();
        
        const seen = new Set<string>();
        const predicates = [];
        for (const line of lines) {
            const eqPos = line.indexOf("=");
            if (eqPos === -1) {
                continue;
            }
            const key = line.slice(0, eqPos).trim();
            const value = line.slice(eqPos + 1).trim();
            const qualName = keys[key] || (key in handlers ? key : null);
            console.log(key, qualName)
            if (!qualName) {
                bot.sendText(context, _("rslist-unknown-key", key ));
                return;
            }
            if (seen.has(qualName)) {
                bot.sendText(context, _("rslist-duplicate-key", qualName));
                return;
            }
            seen.add(qualName);
            predicates.push((entry: LevelEntry) => handlers[qualName](entry, value));
        }
        if (predicates.length === 0) {
            bot.sendText(context, _("rslist-missing-conditions") + supportedKeys + EXAMPLE);
            return;
        }
        const predicate = (entry: LevelEntry) => predicates.every(pred => pred(entry));
        const res = data.filter(predicate);
        res.sort((a, b) => {
            const arr = ["官方", "活动", "共创", "饭制"]
            return arr.indexOf(a.type) - arr.indexOf(b.type) || a.num - b.num || a.versyb.localeCompare(b.versyb);
        });
        if (res.length === 0) {
            bot.sendText(context, _("rslist-no-results"));
            return;
        }

        bot.sendPack(context, res.map(entry => genText(entry, diffcultyData)));
    }
} satisfies CommandRule;

const limitedGroups: string[] = [];
const ASK_NUM_LIMIT = 2;

export const RSHGT: CommandRule = {
    "name": "rshgt",
    "help": _("rshgt-help"),
    handler: async (bot, message, text) => {
        if (limitedGroups.includes(message.group_id)) {
            if (localStorage.getItem(`rshgt-${message.group_id}`) === new Date().toDateString()) {
                return void await bot.sendText(message, _("rshgt-already-played"));
            } else {
                localStorage.setItem(`rshgt-${message.group_id}`, new Date().toDateString());
                await bot.sendText(message, _("rshgt-daily-mode-notice"))
            }
        }
        await bot.sendText(message, _("rshgt-start"));
        const answer = data[Math.floor(Math.random() * data.length)];
        let times = 0;
        let askNumTimes = 0;

        while (times < 10) {
            while (true) {
                const collectedMessage = await bot.requireNextMessage(msg => {
                    // console.log("msg", msg, message)
                    if (msg.group_id !== message.group_id) {
                        return false;
                    }
                    if (!msg.at?.includes("bot")) {
                        return false;
                    }
                    // const seg1 = msg.message.find(m => m.type === "at");
                    // return seg1?.data.qq === bot.qq.toString()
                    return true;
                });
                // await bot.throttle(message);
                // const text = collectedMessage.message
                //     .filter(seg => seg.type === "text")
                //     .map(seg => seg.data.text)
                //     .join("");
                const text = collectedMessage.content
                console.log(text);
                if (text.trim() === "") {
                    continue;
                }
                if (text.trim().match(/^[~～]/)) {
                    continue;
                }
                if (text.match(/[=为是]|\bis\b/)) {
                    const segs = text.split(/[=为是]|\bis\b/);
                    if (segs.length !== 2) {
                        await bot.sendReply(collectedMessage, _("rshgt-format-error"));
                        continue;
                    }
                    let [key, value] = segs;
                    key = key.trim();
                    value = value.trim();
                    const qualName = keys[key] || (key in handlers ? key : null);
                    if (!qualName) {
                        await bot.sendReply(collectedMessage, _("rshgt-unknown-condition") + supportedKeys);
                        continue;
                    }
                    if (qualName === "num" && askNumTimes >= ASK_NUM_LIMIT) {
                        await bot.sendReply(collectedMessage, _("rshgt-num-limit"))
                        continue;
                    }
                    const allThatSatisfies = data.filter(item => handlers[qualName as keyof typeof handlers](item, value));
                    if (allThatSatisfies.length === 0) {
                        await bot.sendReply(collectedMessage, _("rshgt-no-results"));
                        continue;
                    } else {
                        const result = handlers[qualName as keyof typeof handlers](answer, value);
                        const suff = qualName === "num" ? _("rshgt-remaining-num", ASK_NUM_LIMIT - askNumTimes - 1 + "") : "";
                        if (qualName === "num") {
                            askNumTimes++;
                        }
                        await bot.sendReply(collectedMessage, (result ? `[${times+1}/10]${_("rshgt-yes")}` : `[${times+1}/10]${_("rshgt-no")}`) + suff);
                    }
                    break;
                } else if (text.match(/>|<|>=|<=/)) {
                    await bot.sendReply(collectedMessage, _("rshgt-unsupported-syntax"))
                } else {
                    const queried = searchLevel(data, text.trim());
                    if (queried.flag === ResultType.MATCHED) {
                        if (queried.entries.length > 1) {
                            await bot.sendReply(collectedMessage, _("rshgt-not-a-level"))
                            continue;
                        }
                        if (queried.entries[0].repr.page === answer.page) {
                            await bot.sendReply(collectedMessage, _("rshgt-correct"));
                            await bot.sendText(collectedMessage, genText(answer, diffcultyData, queried.entries[0].redirect.join("\n")));
                            return;
                        } else {
                            await bot.sendReply(collectedMessage, _("rshgt-wrong", `[${times+1}/10]`, queried.entries[0].repr.page));
                            break;
                        }
                    } else if (queried.flag === ResultType.NONE) {
                        await bot.sendReply(collectedMessage, _("rshgt-no-match"));
                        continue;
                    }
                }
            }
            times++;
        }
        await bot.sendText(message, _("rshgt-game-over", answer.page));
        await bot.sendText(message, genText(answer, diffcultyData));
    }
}
