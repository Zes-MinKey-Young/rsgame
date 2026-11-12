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

## 部署到 Netlify

构建命令、发布目录、函数目录都写在 `netlify.toml` 里，Netlify 会自动读取，不需要在界面上手填。

### 1. 建站

推荐走 Git：把仓库推到 GitHub，然后在 Netlify 里 **Add new site → Import an existing project** 选这个仓库。

也可以用 CLI：

```bash
npm i -g netlify-cli
netlify login
netlify init          # 关联或新建站点
```

### 2. 建数据库

```bash
netlify db init       # 创建 Netlify DB（Neon Postgres），自动注入 NETLIFY_DATABASE_URL
```

### 3. 配置环境变量

```bash
netlify env:set JWT_SECRET "一长串随机字符"
netlify env:set ROOT_PASSWORD "root 的初始密码"
netlify env:set PUBLIC_OPERATOR "你的运营主体名称"
```

也可以在 Netlify 界面 **Site configuration → Environment variables** 里加。

> `PUBLIC_OPERATOR` 是**构建期**注入、会被打进前端包的，改了必须重新构建才生效。

### 4. 初始化线上数据库

迁移和 seed 只需对线上库执行一次（Netlify 不会自动跑）：

```powershell
$env:DATABASE_URL = "从 Netlify 后台 → Environment variables 复制的 NETLIFY_DATABASE_URL"
bun run db:migrate
$env:ROOT_PASSWORD = "root 的初始密码"     # db:seed 只在本机读取，运行时用不到
bun run db:seed
```

Linux/macOS 用 `export DATABASE_URL=...`。

> `db:seed` 是幂等的：root 已存在就直接跳过。所以忘了设 `ROOT_PASSWORD` 导致没建成 root，
> 补上密码再跑一次即可，不会重复建号。

### 5. 部署

- Git 方式：`git push`，Netlify 自动构建
- CLI 方式：`netlify deploy --build --prod`

### 6. 验收

```bash
# 配置自检：只报告环境变量有没有，不泄露具体值
curl https://<你的站点>/api/health
# {"ok":true,"database":"configured","jwt":"configured",...}

# 连通性自检：真正连一次数据库
curl "https://<你的站点>/api/health?deep=1"
# {"ok":true,...,"dbPing":"ok"}
```

然后打开站点，用 root 登录，去「邀请码」页生成一个邀请码。

### 部署要点

- API 通过 `netlify/functions/api.ts` 的 `config.path = '/api/*'` 直接挂载，不走重定向
- `netlify/functions/cleanup.ts` 带 `config.schedule = '@daily'`，每天物理删除超过 7 天保留期的消息
- Netlify Functions 是无状态、按次计费的，前端 2 秒轮询会持续占用调用次数，小站可接受，人多要留意账单

### 常见故障

| 现象 | 排查方向 |
| --- | --- |
| `/api/health` 返回 HTML 而不是 JSON | 函数没被识别。确认 Functions 页签里有 `api`，且 `netlify.toml` 的 `functions` 目录正确 |
| `/api/*` 一律 502 | 函数启动即崩。先看 Functions → api → Logs；数据库连接串缺失是最常见原因 |
| 函数返回 500 `缺少数据库连接串…` | `NETLIFY_DATABASE_URL` 没注入。重新 `netlify db init`，或在环境变量里手动加 |
| 登录报「用户名或密码错误」但确定密码对 | root 没建成功。确认 `db:migrate` 和 `db:seed` 都对着线上库跑过 |
| 安装依赖阶段失败 | Netlify 没识别到 Bun。在环境变量里加 `BUN_VERSION`，或把构建命令改成 `bun install && bun run build` |
| 页面能开但所有请求 401 | Cookie 没带过去。同域部署默认没问题，自定义域名请确认走的是 HTTPS |

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
| `fs` 读写 `alias.json` / `localStorage.json` | 打包时内联成只读 JSON，写入落内存 |

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
