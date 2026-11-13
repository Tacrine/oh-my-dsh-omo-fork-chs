# oh-my-dsh-omo-fork-chs

[![npm version](https://img.shields.io/npm/v/@tacrine_f/oh-my-dsh-omo-fork-chs)](https://www.npmjs.com/package/@tacrine_f/oh-my-dsh-omo-fork-chs)
[![license: SUL-1.0 (content) + MIT (packaging)](https://img.shields.io/badge/license-SUL--1.0_(content)_%2B_MIT_(packaging)-orange)](#许可)
[![node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24.0.0-blue)](#peer-模型)

`tri-agent` agent preset 的**简体中文非官方 fork**，面向
[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 打包为可发布的 Cordis bundle。
preset id 是 `omo-fork-chs`，`order` 是 `11`，与 `tri-agent` **并存**：本包不改默认 preset，也不改
会话选中哪一个。只有 persona 正文被翻译；工具链组成与编排 doctrine 沿用上游设计。

这个 preset 给 agent 一套双身份加完整编码工具链：

- **Atlas** 是常驻的指挥者。它不亲自实现、验证或审查；它读计划、notepad 与证据，做记录，把每个
  工作单元委派给具名子代理。
- **Prometheus** 是规划 doctrine。会话进入 plan 模式（`/plan`）时，身份在整个规划会话期间切换为
  Prometheus，结束后切回。插件 `plan-aware-persona.mjs` 占用唯一的 `deployment:persona-prefix`
  槽位，每次装配时读取公开的 `plan` session projection 来选择文本。`planMode` service 刻意**不**
  注入：它在 `isolate: { planMode: true }` realm 内部，从外部注入不会解析成功。

除身份之外，preset 还挂载编码工具链：文件系统与 shell 工具、后台任务、skills、goals、plan mode、
compaction、委派与 workflows。patch 共 178 条 `- id:` 条目，分属 10 个 preset 声明与 1 条根层（host plane）
挂载：主 preset `omo-fork-chs` 挂 19 个插件条目，另外 9 个子 preset 分别挂 11 到 13 个（视觉类那个挂 4
个），根层再挂 1 条 `caveman-autoload`。本包附带 **11 个 persona 文件**；主 preset 的插件自己读取
`atlas.md` 与 `prometheus.md`，其余 9 个由对应子 preset 的 `dsh-persona` 条目读取。

## 随包内容

| 文件 | 用途 |
| --- | --- |
| `cordis.patch.yml` | 已发布的 bundle patch：preset 声明（`id: preset-omo-fork-chs`、`config.id: omo-fork-chs`、`config.name: 'Oh My DSH Chs - OMO Fork'`、`order: 11`）及其 `plugins:` 列表，末尾另有一条根层 `caveman-autoload` 挂载。共 958 行，16 处改写。 |
| `plan-aware-persona.mjs` | 包入口，注册 plan-aware persona 前缀，以及该前缀的可配置 suffix。以 `./persona` 导出。 |
| `caveman-autoload.mjs` | 挂在根层的插件：注册 `caveman-ultra` skill，并加一条 order 60 的提示段说明本部署的 caveman 规则。以 `./caveman` 导出。 |
| `tool-gate.mjs` | 工作区级 MCP 工具门禁：把已配置的 MCP server 工具默认全部屏蔽，按会话逐个放行；同时注册随包的 `mcp-lazy-load` skill。以 `./tool-gate` 导出。 |
| `index.js` | 包根。它刻意留空：bundle 的行为在 `cordis.patch.yml` 与 `./persona` 里。 |
| `personas/` | 11 个 persona 文件，已译为简体中文。 |
| `skills/` | skill 正文，共两个：`skills/caveman-ultra/` 由 `caveman-autoload.mjs` 在挂载时读取，`skills/mcp-lazy-load/` 由 `tool-gate.mjs` 在挂载时注册。 |
| `baseline/` | 移植前 patch 的冻结快照，外加一份说明它能证明什么、不能证明什么的 sidecar。 |
| `tools/` | 移植、验证、baseline 与包结构检查的命令行工具。 |
| `test/` | 零依赖测试套件，用 `node --test` 运行。 |
| `LICENSE-MIT.md` | 覆盖我们自己作品的 MIT 条款。 |
| `LICENSE-SUL-1.0.md` | 上游 Sustainable Use License 1.0 的逐字副本，覆盖上游衍生内容。 |
| `NOTICE.md` | 修改声明、上游署名，以及机器可读的许可范围映射。 |

该 patch 挂载了下列由 DSH 提供的 peer 包：

`@deepseek-ai/dsh-agent-preset`、`dsh-agent-instructions`、`dsh-tool-bash`、`dsh-tool-pwsh`、
`dsh-tool-fs`、`dsh-tool-fs-search`、`dsh-tool-jobs`、`dsh-skill-filesystem`、`dsh-tool-skill`、
`dsh-command-goal`、`dsh-tool-goal`、`dsh-plan-mode`、`dsh-compaction-basic`、`dsh-command-compact`、
`dsh-compaction-tool-result-pruner`、`dsh-tool-subagent-control`、`dsh-tool-subagent`、
`dsh-workflow-ptc`、`dsh-tool-workflow`、`dsh-tool-ralph`、`dsh-tool-ask-user`、`dsh-tool-todo`、
`dsh-tool-web`、`dsh-tool-present`，外加 `@deepseek-ai/cordis`。合计 25 条 peer 依赖。

## 安装

安装分**两个显式步骤**：第 1 步装依赖，第 2 步告诉 profile 去加载它。两步都必需，且不假设 `dsh`
在 `PATH` 上。

### 第 1 步：把包安装进 profile

把 CLI 指向你的 DSH checkout 的 bin 文件，把安装转发给 profile：

```powershell
node "<dsh bin>" plugin --profile <profile> add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

例如某个 checkout 的 runtime 是 `<dsh runtime>`，那么 `<dsh bin>` 就是
`<dsh runtime>\@deepseek-ai\dsh\lib\bin.js`：

```powershell
node "<dsh runtime>\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

它在 `$DSH_HOME\profiles\<profile>\` 内运行 pnpm，往该 profile 的 `dependencies` 里写入一条记录。
**它不改动 `dsh.profile.bundles`。**

### 第 2 步：把包加入 `dsh.profile.bundles` 并重启

打开 `$DSH_HOME\profiles\<profile>\package.json`，把包名加入该 profile 的 `dsh.profile.bundles`
数组：

```jsonc
{
  "dsh": {
    "profile": {
      "bundles": [
        // ...你已有的 bundle...
        "@tacrine_f/oh-my-dsh-omo-fork-chs"
      ]
    }
  }
}
```

然后**重启 Host 并新开一个会话。** 运行中的 agent 保留它启动时的 composition，所以已存在的会话
不会加载这个预设，必须新开。

### 验证安装已生效

```powershell
$env:DSH_HOME = "<dsh home>"
node "<dsh bin>" --profile <profile> --dump-config
```

输出中应当有一条 `preset-omo-fork-chs` 条目，其 `name` 为 `@deepseek-ai/dsh-agent-preset`，
`config.id` 为 `omo-fork-chs`，`config.name` 为 `'Oh My DSH Chs - OMO Fork'`，`config.order` 为
`11`，另有九条经由本包解析的 `personas` 表达式。`--dump-config` 打印的是原始 `!!js` 表达式文本，
所以那九条锚点呈现为 `resolve('<pkg>/package.json')` 形式，而不是解析后的文件系统路径。

## 安装后你可能需要自己做的改动

已发布的 patch **只**包含可移植的预设声明。有两样东西属于产出这个 fork 的那台机器，刻意没有
发布，你可能想自己加回去：

1. **把 `omo-fork-chs` 设成默认预设。** 已发布的 patch **不**设置默认预设，本包也不会强加
   一个。想让它成为默认，就在自己的 profile 或 overlay patch 里设置 registry 条目：

   ```yaml
   - id: agent-preset-registry
     config:
       default: omo-fork-chs
   ```

   （`@deepseek-ai/dsh-web-app` 会插入同一条条目，但 `default: standard`；上面这条替换整个
   config，改动只落在 `default` 上。）

2. **给 `subagent_multimodal_looker` 一条模型路由。** 产出这个 fork 的 bundle 曾在那条条目上写过
   一条机器专属的 `provider` 与 `model` 路由，那条路由**不可移植**，所以已发布的 patch 里没有
   `agentOptions`。没有它时，多模态子代理继承 deployment 的路由。要固定一条，就在自己的 overlay
   里给那条条目加一个 `agentOptions` 块：

   ```yaml
   - id: tool-subagent-multimodal-looker
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       # ...已发布的 config...
       agentOptions:
         provider: <your provider>
         model: <your model>
   ```

## 失败模式：刻意 fail loud

`plan-aware-persona.mjs` 在挂载时从磁盘读取自己的 persona 正文。**persona 文件缺失或为空会让挂载
失败**，并在错误里点出文件名：

```
plan-aware-persona: cannot read persona "file:///.../personas/atlas.md"
plan-aware-persona: persona "file:///.../personas/atlas.md" is empty
```

这是刻意的：空的 persona 前缀会悄悄剥掉 agent 的身份，而一条点出文件名的挂载错误，比一个安静丢掉
自己指令的 agent 好处理得多。

## Peer 模型

patch 挂载的每个 `@deepseek-ai/*` 包都声明为 **`peerDependency`**，不是普通 `dependency`。它们由
DSH 提供，bundle 不得安装自己的副本。peer 范围是
`>=0.1.7-rc.2 <0.2.0 || >=0.2.0-0 <0.3.0-0 || >=0.2.1-alpha.1 <0.3.0-0`，同时保留 0.1.7 线与
0.2 线（`@deepseek-ai/cordis` 为 `^4.0.1`）。本包声明 25 条 peer，**没有**运行期依赖，也**没有**
开发依赖，所以测试与检查链中零依赖的那部分不需要安装任何东西。

DSH profile 的 `.npmrc` 设了 `auto-install-peers=false`，这些 peer 是**纯声明式**的：pnpm 不会去
拉取，缺失的 peer 在挂载时表现为解析错误，而不是被悄悄装上。

## 验证

下面全部在仓库根目录运行，**无需安装**。只有 `check:full` 例外，它需要 runtime。

```powershell
# 1. 测试套件。零依赖。94 个测试。
npm run test

# 2. 检查链。零依赖，不需要 runtime。
npm run check

# 3. 同一条检查，但启用 YAML 深比较。需要 runtime。
npm run setup:verify
$env:DSH_RUNTIME = "<absolute path to a node_modules holding js-yaml and @deepseek-ai/cordis-plugin-include>"
npm run check:full

# 4. 从已发布的 patch 重新推导冻结的 baseline 并检查它。
npm run baseline
npm run baseline -- --check

# 5. 从某个源 patch 目录重新移植已发布的 patch。
npm run port -- --src <dir holding cordis.patch.yml>
```

每一条各自证明什么：

- **`npm run test`** 运行 `node:test` 套件，共 94 个测试（93 通过，1 个真机安装用例在未设 `DSH_BIN`
  时整组 skip），不需要安装任何东西。十个测试文件各自覆盖一件事：三组正向改写、反向改写及其往返、
  从已发布的 patch 重新推导 baseline、参数解析器、从两侧检验机器路径模式、零字节守卫、包检查的失败
  路径、提示变量守卫（`prompt-variable-guard`）、caveman loader 的注册契约（`caveman-loader`），
  以及 MCP 门禁的发现、工作区策略与三条元工具（`tool-gate`）。另有 `real-install-verify` 一个真机
  安装用例：未设 `DSH_BIN` 时它整组 skip，所以干净克隆里看到的 `skipped` 就是它。
- **`npm run check`** 是 `node tools/check-package.mjs && node tools/verify-patch.mjs`。

  前者运行一整套结构与许可断言，覆盖：manifest 身份；`exports` 的四个必需键（manifest 实有六个）；
  唯一一条自引用条目；九条 persona 锚点及其文件；`files[]` 覆盖；11 个 persona 的字节数；许可指针；
  三份许可文档；绝不允许进入 tarball 的路径；`files[]` 所列每个目录下的未跟踪文件；npm 无视 `files[]`
  也会自动收录的根目录文件；提供上游指纹时的比对；修改声明的各项主张；许可范围映射，以及把每个范围
  块逐条钉到其所声明内容的锚点；机器路径扫描；约束移植前包名出现位置的类；本仓库向消费者复制的三个模块
  的 SHA256（`index.js`、`plan-aware-persona.mjs`、`caveman-autoload.mjs`）；每份带内部锚点的
  文档中锚点能否解析到标题；patch 的形状。

  后者证明已发布的 patch 仍等于三项已记录改写从冻结 baseline 算出的结果，并报告
  `verdict: "IDENTICAL"` 与 16 处改写点。两者都**零依赖**，所以在干净克隆里无需安装即可通过。
- **`npm run check:full`** 就是单独运行 `node tools/verify-patch.mjs`。当 `DSH_RUNTIME` 指向一个包含
  `js-yaml` 与 `@deepseek-ai/cordis-plugin-include` 的绝对 `node_modules` 时，校验器会用真正的
  entry-list dialect 解析两份文档并做结构化比对，报告 `yamlCompare: "ok"` 与 `sites.length` 为 16。

  **没有 runtime 时它报告 `yamlCompare: "skipped"`，仍以 0 退出**，所以只看退出码不算证据，必须断言
  字段。这也是这一步与 `check` 分开、以及存在 `npm run setup:verify` 的原因：它把 runtime 装进
  `.dsh-verify/`，不给本包增加依赖。该工具自己读取 `DSH_RUNTIME`，不接受 `--runtime` flag，因为
  Windows 上 npm 通过 `cmd.exe` 运行脚本，而 POSIX shell 会展开变量，同一个脚本字符串在两个平台上
  行为不同。
- **`npm run baseline`** 对三项改写施加逆变换，从已发布的 patch 重新推导
  `baseline/cordis.patch.yml`。`-- --check` 把已提交的 baseline 与一份新推导出的副本比对，打印差异行，
  出现漂移时以非零退出。
- **`npm run port -- --src <dir>`** 对 `<dir>` 里的 `cordis.patch.yml` 施加三项改写并写出结果。
  `--src` **没有默认值**，因为唯一诚实的默认值会是一个机器专属目录。错误消息把 baseline 目录作为
  替代来源点出来，而 `npm run port -- --src baseline` 会逐字节复现已提交的 patch。

> **`npm run check` 与 `npm test` 都必须在 git checkout 内运行。** 包检查的三条断言（许可范围映射、
> 机器路径扫描，以及约束移植前包名出现位置的类）都定义在**受版本跟踪的**文件集合之上，所以该工具向
> `git ls-files` 索取这个集合。git 无法回答时，工具以 `run inside a git checkout` 失败，而不是悄悄
> 跳过这三条。`npm test` 同样需要检出：它最后一个用例会针对真实目录树运行包检查，所以在仓库之外解包
> 同样失败。
>
> 因此在仓库之外解包已发布 tarball 的使用者会看到这个错误，这是刻意的：一条对从未做过的工作报告
> 成功的映射检查，比没有检查更糟。已发布的包包含这些工具与测试套件，所以这条链可以从克隆里重跑。

### MCP 懒加载门禁

`tool-gate.mjs` 做**工作区级 MCP 工具门禁**。它从 `@deepseek-ai/dsh-mcp-client` 的 loader 条目取本部署的
MCP 清单，把每台 server 的工具默认全部 mask 住，再按会话逐个放行。于是一个预设不必在每一轮请求里
背上每台已挂载 server 的工具 schema。这套门禁是 `0.4.0` 起加入的；本节描述的行为由
`test/tool-gate.test.mjs` 断言。

**授权来自工作区。** 谁能用哪台 server 由会话 cwd 下的 `.dsh/mcp-servers.json` 决定，文件里是 `allow` 与
`deny` 两张表，可用集合是 `discovered ∩ allow - deny`：

- `deny` 单独列出 = 已配置但未授权，`enable_mcp` 可以解除；
- `deny` 与 `allow` 同时列出才硬否决；
- 文件缺失、`allow` 为空、且没有可从 `deny` 提升的项，表示本工作区一台 MCP server 都用不了；`deny` 本身
  从不授权。

配置由门禁自动创建与维护：某个工作目录第一次触发 `agent/created` 时写入该文件，`allow` 为空、`deny` 收全
已发现的 server；后加进部署的 server 会在下一次 reconcile 时补进 `deny`。手写的配置不会被覆盖（`$comment`
这类未知键会保留），读不了的文件只记日志、保持原样。已配置但未连接的 server 仍会列出，`connected` 为
`false`。

**三条模型侧工具。**

| 工具 | 作用 |
| --- | --- |
| `list_mcp_servers` | 列出可用 server 及其 `server` / `connected` / `toolCount` / `enabled`。尚无授权但已发现 server 时返回空列表，并在 `message` 里点名可交给 `enable_mcp` 的候选 |
| `enable_mcp` | 把一台 server 从 `deny` 移进 `allow`，写盘持久化 |
| `disable_mcp` | 把一台 server 从 `allow` 移回 `deny`，写盘持久化 |

`enable_mcp` / `disable_mcp` 写透到磁盘：`allow` 授权会被同一工作区的后续会话继承，但 `enabled` 是每会话
的内存态，新会话仍需再调一次 `enable_mcp`。**热加载**：调工具或手改配置文件都生效于下一条消息，不需要重启
Host。

**随包 skill。** `skills/mcp-lazy-load/` 随包发布，由 `tool-gate.mjs` 在插件启动时注册。`0.4.1` 起这次注册
带上 `source: 'bundled'`，而这个字段是 skill 能被真正加载的前提：缺它时 skill 会出现在 catalog 里，却永远
加载不了，报 `loaded skill "<name>" source must be a string`。

**挂载范围是四个预设。** 主预设 `omo-fork-chs`，加三个执行预设 `omo-sisyphus-junior`、`omo-hephaestus` 与
`omo-sisyphus`。其它预设没有这三条工具，子代理会话只在这四个预设里才继承同样的默认 mask 行为。

## 真机安装验证（自动化）

`test/real-install-verify.test.mjs` 把本包真的装进一个一次性的隔离 `DSH_HOME`，再对**装出来的产物**
做断言，而不是对仓库里的副本：断言对象是那个被安装、被 compose 的 `cordis.patch.yml`。

```powershell
$env:DSH_BIN = "<你已安装的 DSH 版本目录>\node_modules\@deepseek-ai\dsh\lib\bin.js"
npm run test
```

- **`DSH_BIN`** 指向某个 DSH 版本的 `node_modules/@deepseek-ai/dsh/lib/bin.js`。没有它就**没有** DSH
  可以用来安装，所以该用例整组 `skip`，理由是 `DSH_BIN not set`。这是唯一诚实的跳过：装上了却断言
  不出来算失败，不会被降级成 skip。
- **`OMO_VERIFY_SOURCES`** 是逗号分隔的源列表，**默认值是 `file`**。合法 token 只有五种形态：
  - `file`（或 `file:`）——从当前工作树安装，不依赖任何发布状态，所以它是默认值；
  - `github`——裸族名，ref 依次取 `OMO_VERIFY_REF`、`OMO_VERIFY_SHA`、`git rev-parse HEAD`；
  - `github#<ref>`——显式 ref，直接用；
  - `npm`——裸族名，版本取 `OMO_VERIFY_VERSION`，未设置时取 `package.json` 声明的版本；
  - `npm@<version>`——显式版本。
  任何其它 token（包括拼错的）都会**硬失败**，不会被吞成「0 个用例、退出 0」的假通过。

每个源各跑一遍：建临时 `DSH_HOME` → `dsh plugin --profile verify add -w <源>` → 把包名写进该 profile 的
`dsh.profile.bundles` → `--dump-config` 自检 → 对安装产物跑断言（提示变量守卫、`{{cwd}}` 计数为 0、
suffix 行文本）。`github` 与 `npm` 两族只有在对应 ref 或版本真的可达时才能通过：发布之前用 commit
sha，发布之后用版本号。

## `--dump-config` 不插值

`--dump-config` 只**合成配置树**，不做提示词插值，所以一个把未注册变量写进 persona 段的 preset 同样
能让它以 0 退出、stderr 0 字节。换言之：**它通过不代表提示变量合法**。

提示变量是否合法由静态守卫 `test/prompt-variable-guard.test.mjs` 判定：它扫描 `cordis.patch.yml` 与
`baseline/cordis.patch.yml` 里出现的每个 `{{名字}}`，要求全部落在运行时注册的 `provider` / `model`
之内。两条检查互补，谁也替代不了谁。

## 手工建一个隔离环境（手工步骤，非自动化）

以下**是手工步骤**。自动化测试复刻的只是其中的「会话隔离」语义，不是这个界面流程本身：

1. 在启动器里新增一个启动项；
2. 版本选你已安装的那个 DSH 版本；
3. 隔离方式选「会话隔离」，得到一个独立的 `DSH_HOME`；
4. 可选「从已有 Profile 复制」，从一个现成 profile 起步；
5. 起一个会话，在该 profile 里装包：`dsh plugin --profile <name> add -w <源>`；
6. 把包名加进该 profile 的 `dsh.profile.bundles`；
7. `dsh --profile <name> --dump-config` 自检；
8. 开一个新会话，选中本 preset。

自动化复刻的是第 2 步与第 3 步的组合——一个独立的 `DSH_HOME` 加指定版本的 DSH runtime——然后直接
调用 CLI。它**不驱动 GUI**：启动器自身的界面行为、启动项持久化、以及第 4 步的复制路径都没有被自动化
覆盖。

## caveman 全局加载（包内）

本包随附一个 caveman skill，并在安装后接管本部署的 caveman 规则。下面是它做什么、想达到什么效果；
**这是设计描述，不是「已在本机验证生效」的报告**——本版没有用真实 provider 跑过行为验证。

**随包 skill。** 包里带 `skills/caveman-ultra/`，skill 名 `caveman-ultra`，默认级别 **ultra**。正文
与源 caveman 技能同源，差别只在默认级别、描述、触发词与边界段按本部署改写，并且不含本部署不提供的
斜杠命令。

**生效方式。** 本包在 **bundle 根层** 挂一个模块 `caveman-autoload.mjs`，它做两件事：

- 注册一条 system prompt section，名为 `caveman:loader`，order 60（落在 deployment persona 的 0 与
  plan policy 的 500 之间）；
- 在 skill catalog 里 runtime 注册 `caveman-ultra`，正文读自包内 `skills/caveman-ultra/SKILL.md`。

挂载位置在根层而不是某个预设内，所以它覆盖本进程里的每个会话，不只覆盖选中本预设的那些。这一点是
**结构上的预期**，本版**没有用真实会话确认 catalog 可见性**——沙箱里没有 provider 凭据，能验的只是
注册调用本身。

**旧副本会被取代。** 若环境里另有一条名为 `caveman` 的 skill（例如 `$DSH_HOME/skills/caveman`，正文
默认 `full`），loader 文本会把那条标成「本部署已取代的旧副本（默认 full）」，并要求按 `caveman-ultra`
的规则处理。同名与否两条都会进 catalog，所以这层排除靠的是文本点名，不是覆盖掉那条注册。

**切级方式。** 两个途径：在**请求里直接声明级别**，或在部署时设环境变量 `OMO_CAVEMAN_LEVEL`。合法值
是 `lite` / `full` / `ultra` / `wenyan-lite` / `wenyan-full` / `wenyan-ultra` / `off`，未设置时取
`ultra`。**切级是 prompt-only**：级别只改变提示文本里写明的级别，本版没有对各级别实际的输出行为做
验证。

**关闭。** 说 `stop caveman` 或 `normal mode`。

**覆盖是 9/10。** 主预设加 9 个子预设，其中 9 个既有 skill provider 也有 skill 工具，能
列出并调用这个 skill；`omo-multimodal-looker` 两者都没有，它只收到 loader 文本，拿不到 skill 本身。
这是已知取舍，没有为它强行补一条 skill 行。

**与 `$DSH_HOME/AGENTS.md` 的关系。** 包内 loader 的文本已覆盖那段装载器的作用范围；若 `AGENTS.md`
里仍留着旧的 caveman 装载器段，它不再必需——是否移除由使用者按自己的部署自行决定。

**没有斜杠命令。** 本部署不提供该命令插件，包内也没有 caveman 斜杠命令；切级只走上面那两条路。

## 许可

本仓库**双许可**，两个许可不是二选一：每个文件恰好被其中一个覆盖。它**不是**仅 MIT。

范围映射与 [`NOTICE.md`](./NOTICE.md) 中的两个块一致：

- [`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) 覆盖上游衍生内容：`personas/`、`cordis.patch.yml`、
  `plan-aware-persona.mjs`、`index.js` 与 `baseline/cordis.patch.yml`。
- [`LICENSE-MIT.md`](./LICENSE-MIT.md) 覆盖我们自己的作品：`tools/`、`test/`、`.github/`、
  `baseline/README.md`、`package.json`、`caveman-autoload.mjs`、`tool-gate.mjs`、`skills/`、
  `.gitignore`、`.gitattributes`、`README.md`、`CHANGELOG.md` 与 `NOTICE.md`。
- [`NOTICE.md`](./NOTICE.md) 是权威声明：修改声明、上游署名，以及机器可读的许可范围映射，其中包含
  决定每个受跟踪路径归哪个块的匹配规则。本 README 与 `NOTICE.md` 不一致时，以 NOTICE 为准。

上游条款是 **Sustainable Use License 1.0**，逐字保存在
[`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) 中。SUL-1.0 是 **source-available** 许可，**不是**
OSI 批准的开源许可，本仓库也不作此主张。

上游条款只允许你为自己的内部业务目的，或为非商业、个人用途，使用、复制、分发和制作衍生作品；
只允许你在**免费**且**非商业**的前提下分发。本包正是按这些条款分发：免费、非商业、不可转售。
上游许可**不可再授权**，所以覆盖我们自己文件的 MIT 许可无法延伸到上游衍生的文件之上，也所以
`LICENSE-SUL-1.0.md` 必须随每一份副本一起传播。

MIT 范围上有一条界定：`tools/` 与 `test/` 下的文件是我们自己的作品、按 MIT 授权，但它们内嵌了上游
bundle patch 表达式的**逐字片段**，以便生成和校验该 patch。那些片段仍受上游 SUL-1.0 约束，不会因为
周围代码适用 MIT 而被重新授权。同一条界定也写在 `NOTICE.md` 里，两份文档一致。

本仓库是**非官方 fork**，**未获**上游项目及其作者的背书、赞助或关联，这里也没有任何内容暗示存在
关联或背书。上游名称与商标归其所有者所有。

## 已知问题

- **`0.1.0` 至 `0.2.2` 全部带有同一个提示变量 bug，并且至今仍可正常安装**（尚未 deprecate，
  因为发布端本机凭据没有写权）。这些版本的 `cordis.patch.yml` 在 persona 的 `suffix:` 里写了
  `{{cwd}}`，而运行时只注册 `provider` 与 `model`，所以会话在组装提示词时直接失败：
  `unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"`。装包本身会成功，
  config dump 也会以 0 退出、stderr 0 字节，因为 dump 不插值——故障只在开新会话时出现。
  `0.2.3` 已修复：suffix 改回纯文本，并加了一条静态守卫。

  **已经装了旧版本、会话报这个错时怎么退回**：把本 bundle 从那个 profile 里移除，等修复版本——
  先 `dsh plugin --profile <name> remove @tacrine_f/oh-my-dsh-omo-fork-chs`，再把包名从该 profile
  的 `package.json` 中 `dsh.profile.bundles` 数组里删掉，然后重启 Host 并新开一个会话。更省事的
  做法是直接升级到 `0.2.3`，它就是为这件事发布的。`0.0.0-stage` 没有对应 tag，无法以 tag 树判定
  是否受影响，因此不在上述列表里，也不建议安装。
- **本版本要求 DSH ≥ 0.2.2。** 0.2.0 patch 用 `agentPreset` 为 9 个子代理各选一个 preset，
  而这个字段只有 0.2.2 的 `dsh-tool-subagent` 才读取；0.2.2 同时移除了旧行使用的 `persona` 与
  `toolFilter` 字段。在 DSH 0.2.1 及更早版本上，这些行**照常挂载**，但 `agentPreset` 只是被接受、
  随后从不被读取（schema 合并未知键，而不是拒绝它），于是子代理**既没有 persona，也没有任何工具
  限制**，直接继承父代理的全部工具集：像 explore 或 oracle 这样的只读子代理会静默获得写文件与派生
  子代理的能力。这是**静默提权，不是挂载失败**。下面声明的 peer 范围仍放行更旧的 0.2.x 构建，所以
  这是一条功能性要求，不是 semver 约束。已于 `0.2.2-alpha.2` 验证；不要在低于 0.2.2 的 DSH 上运行
  本版本。
- **声明的 peer 范围覆盖 0.1.7 线与 0.2 线，但 `0.2.1-alpha.1` 只验证过 0.1.x 的 patch。**
  24 个 `@deepseek-ai/dsh-*` peer 声明为
  `>=0.1.7-rc.2 <0.2.0 || >=0.2.0-0 <0.3.0-0 || >=0.2.1-alpha.1 <0.3.0-0`，既保留本 fork 从上游
  继承的范围，又加入 0.2 线。宿主用一条 semver 范围检查判定这些 peer 是否兼容，并把预发布版本纳入
  比较，所以该范围接受 `0.2.0`、`0.2.1-alpha.1` 与更晚的 `0.2.2-beta`，拒绝 `0.3.0-alpha.1`。

  **已用实验在 `0.2.1-alpha.1`（仅 0.1.x 的 patch）与 `0.2.2-alpha.2`（本 patch）上验证。** 在
  profile 中没有任何豁免的情况下，对本包做 config dump 会以 0 退出、向 **stderr 写入 0 字节**，dump
  中带上该 preset 与全部九条 persona 锚点；其中 `0.2.2-alpha.2` 这次运行针对的是把本包注册为 bundle
  的 profile。这证明的是挂载与锚点路径，不是 persona 的字节内容，也不是 preset 的行为：本次验证没有
  调用任何 agent，一个仍然存在但已被截断的 persona 同样会通过。另外 `--dump-config` 只合成配置树、
  不做提示词插值，所以**它通过也不代表提示变量合法**——那一层由静态守卫
  `test/prompt-variable-guard.test.mjs` 负责。

  **`0.3.0-alpha.1` 是重新触发的条件。** 将来的运行时一旦落在该范围内就会再次被拒，stderr 上出现
  同样的不兼容警告，退出码同样是 0，所以不看 stderr 就仍是静默失败。在这类版本上，你要么使用落在
  声明范围内的 dsh，要么用
  `dsh plugin allow-version "<pkg>@<version>" --dsh-version <version> --accept-risk` 授予精确版本
  豁免。该豁免是宿主自带的逃生舱，带有宿主自己警告过的风险，属于对风险的刻意接受，不是受支持的配置。
  **本次放宽没有覆盖的情形仍然需要它**：npm 上已发布的 `0.1.0` 携带旧的、更窄的范围，将来任何
  0.3.x 运行时也需要它。`@deepseek-ai/cordis` 同样声明为 `^4.0.1`，但宿主从不检查它：宿主只评估
  名为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的 peer，所以那一条不是宿主会执行的兼容性
  约束。
- **`baseline/` 证明可复现，不证明正确。** baseline 是移植前 patch 的冻结快照，提交它是为了让往返
  校验在任何地方都能跑。它与源 patch 逐字节一致，而这次推导证明移植是**可复现**的：已发布的 patch 与
  baseline 之间恰好由三项已记录改写相连，别无其他。它**不**证明内容正确。源 patch 本身有错时，这次
  推导会忠实复现那份错误，这里所有检查依然通过。
- **内容正确性的既有证据不随包发布。** 那份证据是简体中文移植工作产出的 `omo-fork-chs-*` 证据集，
  其中 `verify-omo-fork-chs-bundle` 校验器报告 **`FAITHFUL`**，`verify-omo-fork-chs-deport` 校验器
  报告 **`CLEAN`**。这些校验器**依赖机器**：它们针对只存在于移植准备机器上的目录运行，刻意不随本包
  发布。
- **内嵌的 persona 正文带有机器本地路径。** 三份 persona 文档里共十行写出了本地化工作所在机器的
  绝对路径。这违反本仓库「任何提交的文件都不得写出机器绝对路径」的规则，之所以容忍，只因为与源
  bundle 的字节一致性是更硬的约束。受影响的那些行在 `tools/check-package.mjs` 中逐条列举，扫描只在
  这些确切位置接受匹配。`NOTICE.md` 把这件事记为修改条目 8。本文档不复制那些路径，因为它本身也在
  该扫描的覆盖范围内。
- **本仓库与英文 fork 并存。** `Tacrine/oh-my-dsh-omo-fork` 是独立仓库，有自己的包、自己的 preset id
  和自己的范围映射。两个仓库互不影响：它们共享上游血缘，本包中没有任何内容读取、写入或依赖另一个。
- **0.1.0 是本仓库的首次发布，此前没有任何版本发布过。** 本包在 npm 上没有前身，所以没有更早的产物
  可以对照，也不存在从旧版本升级的路径。

## 源流

本包源自那份简体中文 agent-preset bundle。它当时是 **link 安装**：一个接入某台机器 DSH
profile 的私有依赖，指向一个本地目录。那种形态无法装到别处，因为它的 patch 写出的是机器本地包名，
persona 锚点也相对于 profile 目录解析。

本仓库把那份 bundle 变成**可从 npm 安装**的形态，靠三项已记录改写完成：包自引用与九条 persona 路径
锚点被重新指向本包自己的名字及其 `package.json`，头部注释随之更新。结果是一个在任何安装布局下都能
解析的 patch、一份让往返校验不再需要原机器的冻结 baseline，以及一条证明已发布 patch 仍等于其来源的
检查链。

上游项目是 **oh-my-openagent**，曾以 **oh-my-opencode** 之名发布
（https://github.com/code-yeongyu/oh-my-openagent）。本仓库内容派生自上游 commit
`3c711483856207ef530c09d062fa9077c225debb`，对应上游版本 **5.0.1**。persona 正文、工具链组成与
插件都沿用上游设计；本 fork 的贡献是简体中文翻译与打包拆分。

第二条血缘在 skill 上。本包随附的 `caveman-ultra` skill，正文改写自 **caveman** 项目
（[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)，使用协议为
**Apache License 2.0**）：中文与文言文分级、`caveman-ultra` 的整合、默认级别与触发词都是本仓库的
改写，不是上游原文。它此前作为本机 Legacy 部署的 `caveman` skill 存在，迁入本包时做过六项改写。
随包发布的这份改写副本归入哪一个许可块，由 [`NOTICE.md`](./NOTICE.md) 的范围映射决定。
