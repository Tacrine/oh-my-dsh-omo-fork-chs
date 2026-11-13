# oh-my-dsh-omo-fork-chs

[![npm version](https://img.shields.io/npm/v/@tacrine_f/oh-my-dsh-omo-fork-chs)](https://www.npmjs.com/package/@tacrine_f/oh-my-dsh-omo-fork-chs)
[![license: SUL-1.0 (content) + MIT (packaging)](https://img.shields.io/badge/license-SUL--1.0_(content)_%2B_MIT_(packaging)-orange)](#许可)
[![node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24.0.0-blue)](#peer-模型)

`oh-my-opencode` agent preset 的**简体中文非官方分支**，面向 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 打包为可发布的 Cordis bundle。preset id 是 `omo-fork-chs`，`order` 是 `11`；本包不改默认 preset，也不改会话选中哪一个。只有 persona 正文被翻译。
patch 共 178 条 `- id:` 条目、958 行，分属 10 个 preset 声明与 1 条根层（host plane）挂载；随包 11 个 persona 文件、25 条 peer 依赖。

双身份：**Atlas** 是常驻指挥者，不亲自实现、验证或审查，只读计划、notepad 与证据并把工作单元委派给具名子代理；**Prometheus** 是规划 doctrine，会话进入 plan 模式（`/plan`）时身份在整个规划会话期间切换过去。
插件 `plan-aware-persona.mjs` 占用唯一的 `deployment:persona-prefix` 槽位，每次装配时读 `plan` session projection 选文本；`planMode` service 刻意不注入，因为它在 `isolate: { planMode: true }` 的隔离 realm 内，外部注入解析不成功。

## 随包内容

| 文件 | 用途 |
| --- | --- |
| `cordis.patch.yml` | 已发布的 bundle patch：preset 声明（`id: preset-omo-fork-chs`、`config.id: omo-fork-chs`、`order: 11`）与 `plugins:` 列表，末尾一条根层 `caveman-autoload`。 |
| `plan-aware-persona.mjs` | 真正的包入口（`index.js` 有意留空）：注册 plan-aware persona 前缀及其 suffix。以 `./persona` 导出。 |
| `caveman-autoload.mjs` | 根层插件：注册 `caveman-ultra` skill 与一条 order 60 的提示段。以 `./caveman` 导出。 |
| `tool-gate.mjs` | 工作区级 MCP 工具门禁，并注册随包的 `mcp-lazy-load` skill。以 `./tool-gate` 导出。 |
| `personas/` | 11 个 persona 文件（已译简体中文）：主 preset 自读 `atlas.md` 与 `prometheus.md`，其余 9 个由子 preset 的 `dsh-persona` 条目读。 |
| `skills/` | 两个 skill：`caveman-ultra/` 由 `caveman-autoload.mjs` 读，`mcp-lazy-load/` 由 `tool-gate.mjs` 注册。 |
| `baseline/` | 移植前 patch 的冻结快照，附一份说明它能证明什么、不能证明什么的 sidecar。 |
| `tools/`、`test/` | 移植/验证/baseline/包结构检查工具，与零依赖的 `node --test` 套件。 |
| `LICENSE-MIT.md`、`LICENSE-SUL-1.0.md` | 前者是覆盖我们自己作品的 MIT 条款；后者是上游 Sustainable Use License 1.0 的逐字副本，覆盖上游衍生内容。 |
| `NOTICE.md` | 修改声明、上游署名，以及机器可读的许可范围映射。 |

## 安装

**前置条件：DSH ≥ 0.2.2，Node `^22.19.0 || >=24.0.0`。** 更旧的 DSH 会接受 `agentPreset` 却从不读取，子代理没有 persona 也没有工具限制（详见「已知问题」）。

**第 1 步：把包安装进 profile。** 两步都必需，不假设 `dsh` 在 `PATH` 上；该命令在 `$DSH_HOME\profiles\<profile>\` 内跑 pnpm，写入一条 `dependencies` 记录，**不改动 `dsh.profile.bundles`**。

```powershell
node "<dsh bin>" plugin --profile <profile> add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

某 checkout 的 runtime 是 `<dsh runtime>` 时，`<dsh bin>` 即：
```powershell
node "<dsh runtime>\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

**第 2 步：把包加入 `dsh.profile.bundles` 并重启。** 编辑 `$DSH_HOME\profiles\<profile>\package.json`：

```jsonc
{
  "dsh": { "profile": { "bundles": [
    // ...你已有的 bundle...
    "@tacrine_f/oh-my-dsh-omo-fork-chs"
  ] } }
}
```

然后**重启 Host 并新开一个会话**——运行中的 agent 保留启动时的 composition。

**验证安装已生效。**

```powershell
$env:DSH_HOME = "<dsh home>"
node "<dsh bin>" --profile <profile> --dump-config
```

输出里应有一条 `preset-omo-fork-chs`：`name` 为 `@deepseek-ai/dsh-agent-preset`、`config.id` 为 `omo-fork-chs`、`config.name` 为 `'Oh My DSH Chs - OMO Fork'`、`config.order` 为 `11`，外加九条 persona 锚点；dump 打印原始 `!!js` 表达式文本，锚点呈现为 `resolve('<pkg>/package.json')`。

**可选的两处 overlay。** 已发布的 patch 只含可移植的预设声明；下面两样属于产出它的那台机器，刻意没发布。

1. **设默认预设**——patch 不设默认预设，本包也不强加。这条 overlay **替换整个 config**，改动只落在 `default` 上（`@deepseek-ai/dsh-web-app` 也插入同一条目，但值是 `standard`）：

```yaml
- id: agent-preset-registry
  config:
    default: omo-fork-chs
```

2. **给 `subagent_multimodal_looker` 一条模型路由**——patch 里没有 `agentOptions`，该子代理默认继承 deployment 路由；写进你自己的 overlay 即可固定：

```yaml
- id: tool-subagent-multimodal-looker
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    # ...已发布的 config...
    agentOptions:
      provider: <your provider>
      model: <your model>
```

## Peer 模型

patch 挂载的每个 `@deepseek-ai/*` 包都是 **`peerDependency`**，由 DSH 提供，bundle 不装自己的副本。范围是 `>=0.1.7-rc.2 <0.2.0 || >=0.2.0-0 <0.3.0-0 || >=0.2.1-alpha.1 <0.3.0-0`（`@deepseek-ai/cordis` 为 `^4.0.1`）。
本包声明 25 条，**没有**运行期依赖，也**没有**开发依赖。DSH profile 的 `.npmrc` 设了 `auto-install-peers=false`，这些 peer 是**纯声明式**的：pnpm 不会去拉取，缺失的 peer 在挂载时表现为解析错误，而不是被悄悄装上。

## 验证

全部在仓库根目录运行，**无需安装**；只有 `check:full` 需要 runtime。`npm run test` 跑 94 个测试（93 通过、1 个真机用例在未设 `DSH_BIN` 时整组 skip）。

```powershell
npm run test
npm run check
npm run setup:verify
$env:DSH_RUNTIME = "<absolute path to a node_modules holding js-yaml and @deepseek-ai/cordis-plugin-include>"
npm run check:full
npm run baseline
npm run baseline -- --check
npm run port -- --src <dir holding cordis.patch.yml>
```

| 命令 | 各自证明什么 |
| --- | --- |
| `npm run test` | `node:test` 套件：十个测试文件覆盖改写往返、baseline 推导、参数解析、机器路径模式、零字节守卫、包检查失败路径、提示变量守卫、caveman loader 与 MCP 门禁。 |
| `npm run check` | 结构与许可断言（manifest、`exports`（4 个必需键，实有 6 个）、persona 锚点与字节数、`files[]` 覆盖、三份许可文档、机器路径扫描、三个模块的 SHA256、锚点可解析性、patch 形状）加往返校验：`verdict: "IDENTICAL"` 与 16 处改写点。 |
| `npm run check:full` | 真实 runtime 下的结构化比对，报 `yamlCompare: "ok"` 与 `sites.length` 16；无 runtime 时报 `skipped` 仍以 0 退出，只看退出码不算证据。 |
| `npm run baseline` | 施加逆变换并重新推导 baseline；`-- --check` 比对提交的 baseline，漂移即非零退出。 |
| `npm run port -- --src <目录>` | 对 `<目录>` 的 patch 施加改写写出结果；`--src` 无默认值，`--src baseline` 逐字节复现已提交的 patch。 |

> **`npm run check` 与 `npm test` 必须在 git checkout 内运行**：三条断言定义在 `git ls-files` 之上，git 答不出来就以 `run inside a git checkout` 失败，不会跳过；在仓库外解包 tarball 会看到它。

### MCP 懒加载门禁

`tool-gate.mjs` 从 `@deepseek-ai/dsh-mcp-client` 的 loader 条目取本部署的 MCP 清单，把每台 server 的工具默认全部 mask，再按会话逐个放行，于是每轮请求不必背上全部工具 schema。门禁从 `0.4.0` 起加入。

**授权来自工作区。** 会话 cwd 下的 `.dsh/mcp-servers.json` 用 `allow` / `deny` 两张表，可用集合是 `discovered ∩ allow - deny`：只在 `deny` 里出现的 server＝已配置但未授权，`enable_mcp` 可解除；`allow` 与 `deny` 同时出现才是硬否决，`deny` 本身从不授权；文件缺失且 `allow` 为空、又无可从 `deny` 提升的项＝本工作区一台 server 都用不了（新工作区的默认状态）。门禁在首次 `agent/created` 时自动写入它，`deny` 收全已发现的 server；手写配置不被覆盖。

**三条工具**：`list_mcp_servers`（列出 `server` / `connected` / `toolCount` / `enabled`）、`enable_mcp`、`disable_mcp`。后两者写透磁盘，`allow` 授权被后续会话继承；但 **`enabled` 是每会话内存态，新会话仍需再调 `enable_mcp`**。调工具或手改配置即时生效，无需重启 Host。

挂载范围是四个预设：主预设 `omo-fork-chs` 与 `omo-sisyphus-junior`、`omo-hephaestus`、`omo-sisyphus`；其它预设没有这三条工具。随包 skill `skills/mcp-lazy-load/` 由 `tool-gate.mjs` 注册，`0.4.1` 起带 `source: 'bundled'`（缺它时 skill 进得了 catalog 却永远加载不了）。细节见 `skills/mcp-lazy-load/SKILL.md` 与 `test/tool-gate.test.mjs`。

### caveman 全局加载

包内 `skills/caveman-ultra/` 的 skill 名为 `caveman-ultra`、默认级别 **ultra**；`caveman-autoload.mjs` 挂在 bundle 根层，注册一条 order 60 的 `caveman:loader` 提示段，并在 catalog 里 runtime 注册它。挂在根层而非某个预设内，所以它覆盖本进程的每个会话——**这是结构上的预期，本版没有用真实会话确认 catalog 可见性**。

切级两个途径：请求里直接声明级别，或设 `OMO_CAVEMAN_LEVEL`（`lite` / `full` / `ultra` / `wenyan-lite` / `wenyan-full` / `wenyan-ultra` / `off`，未设取 `ultra`）；切级只改提示文本，**本版未验证各级别的实际输出**。关闭说 `stop caveman` 或 `normal mode`；本部署不提供 caveman 斜杠命令。

**旧副本不会被覆盖。** 若环境里另有一条名为 `caveman` 的 skill（例如 `$DSH_HOME/skills/caveman`，默认 `full`），两条都会进 catalog；排除靠 loader 文本点名，不是删掉那条注册。

**覆盖是 9/10**（主预设 + 9 个子预设里的 9 个）：`omo-multimodal-looker` 既无 skill provider 也无 skill 工具，只收到 loader 文本。细节见 `skills/caveman-ultra/SKILL.md`，本节行为由 `test/caveman-loader.test.mjs` 断言。

## 真机安装验证与手工隔离

`test/real-install-verify.test.mjs` 把本包真的装进一次性的隔离 `DSH_HOME`，再对**装出来的产物**断言：对象是被安装、被 compose 的 `cordis.patch.yml`，不是仓库里的副本。

```powershell
$env:DSH_BIN = "<你已安装的 DSH 版本目录>\node_modules\@deepseek-ai\dsh\lib\bin.js"
npm run test
```

- **`DSH_BIN`** 指向某个 DSH 版本的 `node_modules/@deepseek-ai/dsh/lib/bin.js`；没有它就装不了，该用例整组 `skip`（理由 `DSH_BIN not set`）——唯一诚实的跳过，装上了却断言不出来算失败。
- **`OMO_VERIFY_SOURCES`** 是逗号分隔的源列表，默认 `file`；合法 token 只有 `file`（或 `file:`）、`github`、`github#<ref>`、`npm`、`npm@<version>` 五种：`github` 裸族名取 `OMO_VERIFY_REF`／`OMO_VERIFY_SHA`／`git rev-parse HEAD`；`npm` 裸族名取 `OMO_VERIFY_VERSION`，未设时用 `package.json` 版本。
  其它 token（含拼错）**硬失败**，不会被吞成 0 用例假通过；`github` 与 `npm` 只在 ref 或版本可达时才过——发布前用 commit sha，发布后用版本号。

**手工等价流程**（只用于启动器界面）：

1. 新增启动项，选已安装的 DSH 版本；
2. 隔离方式选「会话隔离」，得到一个独立 `DSH_HOME`；
3. 起一个会话，在该 profile 里 `dsh plugin --profile <name> add -w <源>`；
4. 把包名写进该 profile 的 `dsh.profile.bundles`；
5. `dsh --profile <name> --dump-config` 自检；
6. 新开会话，选中本 preset。

自动化只复刻第 1、2 步的「独立 `DSH_HOME` + 指定版本」组合，**不驱动 GUI**：启动器界面、启动项持久化与「从已有 Profile 复制」都没覆盖。

### `--dump-config` 不插值

`--dump-config` 只合成配置树、不做提示词插值，所以把未注册变量写进 persona 段也能让它以 0 退出、stderr 0 字节：**它通过不代表提示变量合法**。那一层由 `test/prompt-variable-guard.test.mjs` 判定：两个 patch 里每个 `{{名字}}` 都必须落在运行时注册的 `provider` / `model` 之内。

## 许可

本仓库**双许可**，两个许可不是二选一：每个文件恰好被其中一个覆盖。它**不是**仅 MIT。范围映射与 [`NOTICE.md`](./NOTICE.md) 的两个块一致：[`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) 覆盖上游衍生内容（`personas/`、`cordis.patch.yml`、`plan-aware-persona.mjs`、`index.js`、`baseline/cordis.patch.yml`）；[`LICENSE-MIT.md`](./LICENSE-MIT.md) 覆盖我们自己的作品（`tools/`、`test/`、`.github/`、`package.json`、`caveman-autoload.mjs`、`tool-gate.mjs`、`skills/`、`README.md`、`CHANGELOG.md`、`NOTICE.md`，另含 `baseline/README.md`、`.gitignore`、`.gitattributes`）。[`NOTICE.md`](./NOTICE.md) 是权威声明：与本文冲突以 NOTICE 为准。

上游条款是 **Sustainable Use License 1.0**，逐字保存在 [`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) 中。SUL-1.0 是 **source-available**，**不是** OSI 批准的开源许可，本仓库不作此主张：它只允许为自己的内部业务或非商业、个人用途使用、复制、分发与制作衍生作品，分发须**免费**且**非商业**，而且**不可再授权**——所以 MIT 无法延伸到上游衍生的文件之上，`LICENSE-SUL-1.0.md` 必须随每份副本传播。

MIT 范围上有一条界定：`tools/` 与 `test/` 是我们自己的作品、按 MIT 授权，但内嵌了上游 bundle patch 表达式的**逐字片段**，那些片段仍受 SUL-1.0 约束，不因周围代码适用 MIT 而被重新授权。本仓库是**非官方 fork**，**未获**上游项目及其作者背书、赞助或关联；上游名称与商标归其所有者所有。

## 已知问题

- **`0.1.0` 至 `0.2.2` 带同一个提示变量 bug**：这些版本的 `cordis.patch.yml` 在 persona 的 `suffix:` 写了 `{{cwd}}`，而运行时只注册 `provider` 与 `model`，组装提示词即失败 `unknown prompt variable "{{cwd}}"`；装包与 dump 都成功（dump 不做插值），故障只在开新会话时出现。`0.2.3` 修好了：suffix 改回纯文本并加静态守卫。旧版本仍可安装、尚未 deprecate（发布端本机凭据没有写权）；自救是升到 `0.2.3`，或 `dsh plugin --profile <name> remove @tacrine_f/oh-my-dsh-omo-fork-chs` 后把包名从 `dsh.profile.bundles` 删掉再重启并新开会话。`0.0.0-stage` 无对应 tag、无法以 tag 树判定，不建议安装。`0.1.0` 是本仓库首次发布，npm 上无前身。
- **必须 DSH ≥ 0.2.2**：更旧版本接受 `agentPreset` 却从不读取（schema 合并未知键而非拒绝），子代理既没有 persona 也没有工具限制，静默继承父代理全部工具集——explore、oracle 这类只读子代理会获得写文件与派生子代理的能力。这是提权，不是挂载失败；peer 范围仍放行更旧的 0.2.x，所以是功能性要求而非 semver 约束。已于 `0.2.2-alpha.2` 验证。
- **peer 范围覆盖 0.1.7 线与 0.2 线，但 `0.2.1-alpha.1` 只验证过 0.1.x 的 patch**：宿主把预发布纳入比较，接受 `0.2.0`、`0.2.1-alpha.1`、`0.2.2-beta` 而拒绝 `0.3.0-alpha.1`。范围内做 config dump 以 0 退出、stderr 0 字节，并带上该 preset 与全部 persona 锚点——证明的是挂载与锚点路径，不是 persona 字节内容，也不是 preset 行为。将来落在 0.3.x 会被同样拒绝且退出码仍是 0：要么用范围内的 dsh，要么 `dsh plugin allow-version "<pkg>@<version>" --dsh-version <version> --accept-risk` 授精确版本豁免（宿主自带逃生舱，属刻意接受风险）。`@deepseek-ai/cordis` 虽声明 `^4.0.1`，宿主从不检查它——只评估 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的 peer。
- **`baseline/` 证明可复现，不证明正确**：它是移植前 patch 的冻结快照，提交它是为了让往返校验到处能跑。源 patch 本身有错时，推导会忠实复现那份错误，而这里所有检查依然通过。
- **内容正确性的既有证据不随包发布**：`omo-fork-chs-*` 证据集里 `verify-omo-fork-chs-bundle` 报告 `FAITHFUL`、`verify-omo-fork-chs-deport` 报告 `CLEAN`；这些校验器依赖只存在于移植准备机器上的目录，刻意不随包发布。
- **内嵌的 persona 正文带有机器本地路径**：三份 persona 文档里共十行写出了本地化机器的绝对路径，违反本仓库「提交的文件不得写机器绝对路径」的规则，容忍它只是因为与源 bundle 的字节一致性是更硬的约束。受影响的行在 `tools/check-package.mjs` 里逐条列举，`NOTICE.md` 记为修改条目 8；本文档不复制那些路径，因为它也在该扫描范围内。
- **persona 文件缺失或为空会让挂载失败**，并在错误里点出文件名，例如 `plan-aware-persona: cannot read persona "file:///.../personas/atlas.md"`。这是刻意的：空的 persona 前缀会悄悄剥掉 agent 的身份，而点出文件名的挂载错误比一个安静丢掉指令的 agent 好处理得多。

## 上游鸣谢

上游项目是 **oh-my-openagent**，曾以 **oh-my-opencode** 之名发布（https://github.com/code-yeongyu/oh-my-openagent）；本仓库派生自上游 commit `3c711483856207ef530c09d062fa9077c225debb`（版本 **5.0.1**）；persona 正文、工具链与插件沿用上游设计，本 fork 的贡献是简体中文翻译与打包拆分。

第二条：随附的 `caveman-ultra` 正文改写自 **caveman** 项目（[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)，协议为 **Apache License 2.0**）。中文与文言文分级、整合到 `caveman-ultra`、默认级别与触发词都是本仓库改写，不是上游原文；它此前作为本机 Legacy 部署的 `caveman` skill 存在，迁入本包时做过六项改写。随包副本归入哪个许可块由 [`NOTICE.md`](./NOTICE.md) 的范围映射决定。
