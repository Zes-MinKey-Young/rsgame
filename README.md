# rsgame-serverless

多用户开房间玩 Bot 小游戏的 Serverless 版本，目标平台 Netlify。

定位：小规模（<20 人）受控环境，**不是**公共聊天室。注册为邀请制，防止不受信任的用户进入。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Bun（本地开发 / 脚本） |
| API | Hono，跑在 Netlify Functions v2 |
| 数据库 | Postgres + Drizzle ORM（`postgres-js` 驱动，本地 Docker / 线上 Netlify DB 通用） |
| 鉴权 | JWT（`jose`，HS256）+ HttpOnly Cookie |
| 密码 | PBKDF2-SHA256，210000 次迭代 |
| 前端 | SvelteKit **纯 SPA**（`adapter-static` + `ssr = false`），不含任何服务端能力 |
| 实时 | 2 秒短轮询（`src/lib/realtime.ts`），页面隐藏时自动停止 |
| 静态资源 | Netlify Blobs：`~rs` 用的关卡表，超级管理员可在网页上替换，不需要重新构建 |

Netlify 上没有常驻进程，因此原来的 WebSocket 广播、进程内消息缓存、Bot 的阻塞式
"等待用户下一句话" 全部改为数据库驱动：

- 消息落库，客户端用 `?after=<id>` 增量拉取
- Bot 游戏用 `bot_sessions` 表存状态，每条新消息进来推进一步状态机

## 权限模型

位掩码，`permission === 0` 表示封禁。

| 位 | 值 | 名称 | 能力 |
| --- | --- | --- | --- |
| TALK | 1 | 用户 | 聊天 |
| BAN | 4 | 版主 | 封禁/解封、**创建房间** |
| DELETE | 16 | 管理 | 修改权限、**撤回他人消息**、关闭房间 |
| ROOT | 64 | 超级管理员 | 删号、**签发邀请码** |

2 / 8 / 32 留空以便日后插层。ROOT 不隐含 BAN/DELETE 位，判定时用"或"关系。

## 本地开发

数据库用 Docker 起一个就够了（镜像约 40MB）：

```powershell
cd rsgame-serverless

# 1. 依赖
bun install

# 2. 起本地 Postgres（宿主机端口 55432，避免和本机已有 5432 冲突）
bun run db:up

# 3. 环境变量
Copy-Item .env.example .env
# .env 默认值即可直接跑：
#   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/rsgame
#   JWT_SECRET=local-dev-secret-please-change-in-production
#   ROOT_PASSWORD=root12345

# 4. 建表 + 初始化 root（容器刚起来会等几秒，失败就重跑一次）
bun run db:migrate
bun run db:seed

# 5. 同时起 API(8787) 和前端(5173，/api 由 Vite 代理到 8787)
bun run dev
```

浏览器打开 <http://localhost:5173>。

- 用 `root` / `root12345` 登录
- 先到「邀请码」页面生成一个邀请码（默认 1 次，可改）
- 用邀请码注册第二个账号，才能测双人聊天
- 要测 `~rshgt`，发消息时勾上输入框右侧的 `@bot`

> 首次 `bun run dev` 时 Vite 要做依赖预打包，**大约 10-20 秒**才监听 5173，属于正常现象。
> 想只跑其中一半可以用 `bun run dev:api` / `bun run dev:web`。

停止：`bun run db:down`（删掉容器，数据也一起没了）。想保留数据就只 `docker stop rsgame-pg`。

### 两个冒烟测试

```bash
bun run scripts/api-smoke.ts   # 端到端跑一遍：登录/邀请码/注册/开房/发消息/撤回/封禁
bun run scripts/bot-smoke.ts   # 只测 Bot 游戏层，不碰数据库
```

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 本地开发用的 Postgres 连接串 |
| `NETLIFY_DATABASE_URL` | Netlify 自动注入，优先级高于 `DATABASE_URL` |
| `JWT_SECRET` | JWT 签名密钥 |
| `ROOT_PASSWORD` | 仅 `db:seed` 使用，root 初始密码 |
| `PUBLIC_OPERATOR` | 服务条款中「运营主体」的名称，构建时注入；留空则显示「由部署者填写」 |

## 数据库

```bash
bun run db:generate   # 修改 schema 后生成迁移 SQL
bun run db:migrate    # 执行迁移
bun run db:push       # 开发期直接把 schema 推到库（跳过迁移文件）
bun run db:studio     # 图形界面
bun run db:seed       # 幂等创建 root
```

## 部署到 Netlify（SOP）

照着做完就能上线，大约 15 分钟。构建命令、发布目录、函数目录都已经写在 `netlify.toml` 里，界面上不用填。

> 命令用 PowerShell 写。macOS / Linux 把 `$env:X = "..."` 换成 `export X=...` 即可。

### 第 0 步：前置

- 一个 Netlify 账号
- 一个 GitHub 仓库（放本项目）
- 本机装好 Bun：`bun --version` 能出版本号

### 第 1 步：推到 GitHub

```powershell
git remote add origin https://github.com/<你>/<仓库>.git
git push -u origin master
```

### 第 2 步：在 Netlify 导入仓库

网页 → **Add new site → Import an existing project** → 选 GitHub → 选这个仓库 → 部署。

第一次构建会失败或接口报错，因为数据库还没配，正常，继续往下走。

### 第 3 步：把本地目录链接到站点

网页导入只绑定了「站点 ↔ 仓库」。CLI 还需要知道「本地目录 ↔ 站点」，否则后面所有命令都会说 `You don't appear to be in a folder that is linked to a project`。

```powershell
bunx netlify login
bunx netlify link        # 选 "Use current git remote origin"，或按站点名搜索
bunx netlify status      # 能看到站点名就成功了
```

### 第 4 步：开通数据库

```powershell
bunx netlify db init
```

> ⚠️ 这一步**只装工具链**（`@netlify/database` 等），**不会真的建库**。
> 真正的库在后台面板：<https://app.netlify.com/projects/你的站点/database>

```powershell
bunx netlify database status   # 应显示 Netlify Database is enabled
```

### 第 5 步：复制连接串

在后台 Database 面板里复制 connection string，形如：

```
postgresql://netlifydb_owner:密码@ep-xxx-pooler.区域.aws.neon.tech/neondb?sslmode=require
```

两个要点：**用带 `-pooler` 的那条**，**结尾必须带 `?sslmode=require`**。

### 第 6 步：建表 + 建超管

在你自己机器上执行，直接连线上库：

```powershell
$env:DATABASE_URL = "<上一步复制的连接串>"
bun run db:migrate

$env:ROOT_PASSWORD = "至少8位的root密码"
bun run db:seed
```

看到 `[migrate] 迁移完成` 和 `[seed] root 账号创建完成` 就成了。

> `db:seed` 是幂等的，root 已存在就跳过。忘了设密码导致没建成，补上重跑一次即可。

### 第 7 步：配置环境变量

```powershell
bunx netlify env:set JWT_SECRET "一长串随机字符"
bunx netlify env:set PUBLIC_OPERATOR "你的运营主体名称"
```

| 变量 | 用在哪 | 必须 |
| --- | --- | --- |
| `NETLIFY_DATABASE_URL` | 函数运行时 | Netlify 数据库自动注入 |
| `JWT_SECRET` | 函数运行时 | 是 |
| `PUBLIC_OPERATOR` | **构建期**，会被打进前端包 | 建议 |
| `ROOT_PASSWORD` | 只在 `db:seed` 时用一次 | 否 |

`ROOT_PASSWORD` **不要**加到 Netlify 上——运行时根本读不到也不需要，加了纯属摆设。

### 第 8 步：重新部署让变量生效

**改完环境变量必须重新部署**，否则函数还在读旧值。

```powershell
git commit --allow-empty -m "chore: 重新构建以应用环境变量"
git push
```

或者网页 **Deploys → Trigger deploy → Deploy site**。

### 第 9 步：验收

```powershell
curl https://<你的站点>/api/health
# {"ok":true,"database":"configured","jwt":"configured",...}

curl "https://<你的站点>/api/health?deep=1"
# {"ok":true,...,"dbPing":"ok"}
```

| 返回 | 含义 |
| --- | --- |
| `database: configured` + `dbPing: ok` | 全部正常 |
| `database: missing` | 环境变量没生效，回第 8 步 |
| 返回 HTML | 函数没挂上，看第 11 步 |

最后打开站点，用 `root` + 第 6 步的密码登录，去「邀请码」页生成一个邀请码，才能注册第二个账号。

### 第 10 步：更新关卡数据（不需要重新构建）

游戏用的关卡表默认打包在构建产物里。换新版本：

1. 用 root 登录，点顶栏 **关卡数据**
2. 选择 `localStorage.json`（必须是包含 `rswiki:NavLevel-data` 和 `rswiki:NavLevel-difficulty` 的对象）
3. 点 **上传并替换**

数据存进 **Netlify Blobs**，此后更新都不再消耗构建次数。

> 已预热的函数实例仍持有旧数据，**要等下一次冷启动才生效**。低流量时段可能几分钟，可以过一会儿刷新页面重试。

### 第 11 步：排障

| 现象 | 排查方向 |
| --- | --- |
| CLI 说 `not linked to a project` | 没跑第 3 步，或在错误的目录下执行 |
| `netlify env:list` 里没有 `NETLIFY_DATABASE_URL` | 该命令默认只看 dev 上下文；受管变量也不在这里列。以 `/api/health` 的结果为准 |
| `/api/health` 返回 HTML 而不是 JSON | 函数没挂上。确认 Functions 页签里有 `api`，`netlify.toml` 的 `functions` 目录正确 |
| `/api/*` 一律 502 | 函数启动即崩。先看 Functions → api → Logs；数据库连接串缺失最常见 |
| 函数返回 500 `缺少数据库连接串…` | 环境变量没注入，或没重新部署（第 8 步） |
| 登录报「用户名或密码错误」但密码确定对 | root 没建成。确认第 6 步的 `db:migrate`、`db:seed` 都跑过 |
| 改完环境变量没反应 | 必须重新部署（第 8 步）才生效 |
| 安装依赖阶段失败 | Netlify 没识别 Bun。加环境变量 `BUN_VERSION`，或把构建命令改成 `bun install && bun run build` |
| 页面能开但所有请求 401 | Cookie 没带上。同域部署没问题；自定义域名确认走 HTTPS |
| 关卡数据上传成功但 `~rs` 没变 | 已预热的函数实例还在用旧数据，等冷启动 |

### 部署要点（备忘）

- API 通过 `netlify/functions/api.ts` 的 `config.path = '/api/*'` 直接挂载，不走重定向
- `netlify/functions/cleanup.ts` 带 `config.schedule = '@daily'`，每天物理删除超过 7 天保留期的消息
- 关卡数据存 Netlify Blobs，与代码解耦，更新不消耗构建
- Netlify Functions 无状态、按调用计费，前端 2 秒轮询会持续消耗调用次数；小站可接受，人多要留意账单

## Bot 游戏

游戏业务层（`src/api/bot/RSQuery.ts`、`RSList.ts`、`data.ts`、`i18n.*`、关卡数据）**逐字沿用原版 rsgame**，
可移植的差异全部收在 `src/api/bot/bot.ts`（Bot 类 + 参数解析）和 `engine.ts`（会话与落库）里。

| 原版依赖 | 本版实现 |
| --- | --- |
| `EventTarget` 广播 `distribute()` | `Bot.outputs` 输出缓冲，执行完统一下库 |
| `await requireNextMessage()` 阻塞等待下一句 | **消息转录回放**：每轮用「到目前为的全部消息」重跑 handler，转录耗尽即抛 `SuspendSignal` 挂起 |
| 进程内保存游戏状态 | `bot_sessions.state` 存 `{ command, text, trigger, transcript, emitted, seed }` |
| `Math.random()` 选答案 | 会话带固定种子，回放期间接管 `Math.random`，保证每次重跑结果一致 |
| `sendPack` 每 100 条 sleep 2 秒 | 直接入缓冲，落库时同 `batchId` 分组，前端折叠展示 |
| `fs` 读写 `alias.json` / `localStorage.json` | `alias.json` 打包内联；关卡数据放 Netlify Blobs，构建期内联一份兜底基线 |

回放的去重靠 `emitted` 水位线：转录只追加不修改，重跑产出一定是上一轮的超集，`slice(emitted)` 就是本轮新增。

`~rshgt` 要求回答时 **@bot**，前端输入框右侧的 `@bot` 勾选框就是为此准备的。

冒烟测试（不依赖数据库）：

```bash
bun run scripts/bot-smoke.ts
```

## 国际化

- 语言包：`src/lib/i18n/locales/{zh-hans,zh-hant,en}.yaml`（YAML 为唯一事实来源）
- 运行时：`svelte-i18n`。`vite.config.ts` 里的小插件在构建期把 `.yaml` 转成 JS 对象，浏览器端不带 YAML 解析器
- 类型安全：`scripts/type-i18n.ts`（改编自 kipphi-apparatus）从 `zh-hans.yaml` 生成 `i18n-types.ts` 中的 `I18nMapping`，组件里写 `$t('nav.rooms')`，键名与占位符都会被检查

```bash
bun run i18n:types   # 改完 locales 后重新生成类型（prepare 已自动调用）
bun run i18n:check   # 校验三个语言包的键与占位符是否一致
bun run i18n:watch   # 监听 locales 变化自动重生成
```

`src/lib/i18n/locales/` 是两层结构（命名空间 → 键 → 文案），正好对应 svelte-i18n 的点号路径查找。

## 服务条款

注册页打开时自动弹出，需点击同意后才能提交。文案位于语言包的 `tos.*` 下，共五条：
站点性质与主体、用途限定、内容规范、Cookie 与数据保留、免责声明。

「运营主体」名称由部署者通过 `PUBLIC_OPERATOR` 环境变量填写；未填写时条款中会显式显示占位文案。

## 消息保留

聊天记录保留 7 天：

- 所有查询都带 `created_at > now() - 7 days` 条件
- 定时函数每天物理清理一次

## 目录结构

```
src/
  api/
    app.ts              Hono 应用装配
    lib/                鉴权、密码、JWT、权限、消息读写、序列化
    routes/             auth / invites / rooms / messages / users / me
    bot/                命令引擎 + 游戏会话状态机
  db/
    schema.ts           Drizzle schema
    index.ts            Neon HTTP 客户端
    migrate.ts / seed.ts
  routes/               SvelteKit SPA 页面
  lib/                  前端 API 客户端、会话 store、轮询
netlify/functions/      api.ts（catch-all）/ cleanup.ts（定时）
```

## 与旧版 rsgame 的差异

| 项 | 旧版 | 本版 |
| --- | --- | --- |
| 实时 | WebSocket 长连接 | 2 秒轮询 |
| 聊天 | 纯转发，零持久化 | 落库，保留 7 天，支持撤回 |
| 注册 | 自由注册 | 邀请制 |
| 房间 | 内存数组，无法关闭 | 数据表，可开关，有房主 |
| 密码 | 双层 SHA256 | PBKDF2-SHA256 |
| 权限校验 | 用 JWT 里的快照 | 每次请求回查数据库 |
| Bot 交互 | `await requireNextMessage()` | 转录回放 + 状态入库 |
| Bot 游戏逻辑 | — | **完全未改动**，差异收在 `bot.ts` / `engine.ts` |

> `tsconfig.json` 保持 `strict: false`，与原版 rsgame 一致——游戏业务层的源码是按这个严格度写的。
