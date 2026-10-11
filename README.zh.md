# oh-my-dsh-omo-fork-chs

[![npm version](https://img.shields.io/npm/v/@tacrine_f/oh-my-dsh-omo-fork-chs)](https://www.npmjs.com/package/@tacrine_f/oh-my-dsh-omo-fork-chs)
[![license: SUL-1.0 (content) + MIT (packaging)](https://img.shields.io/badge/license-SUL--1.0_(content)_%2B_MIT_(packaging)-orange)](#license)
[![node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24.0.0-blue)](#peer-model)

`tri-agent` agent preset 的**简体中文非官方 fork**，面向
[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 打包为可发布的 Cordis bundle。
它的 preset id 是 `omo-fork-chs`，`order` 是 `11`，因此它与 `tri-agent` **并存**而不是取而代之：
本包**不改变默认 preset**，也不改变会话选中哪一个 preset。只有 persona 正文被翻译；工具链组成与
编排 doctrine 都沿用上游设计。

这个 preset 给 agent 一套「双身份 + 完整编码工具链」：

- **Atlas** 是常驻的指挥者。它不亲自实现、验证或审查；它读计划、notepad 与证据，做簿记，并把每一个
  工作单元委派给具名子代理。
- **Prometheus** 是规划 doctrine。当会话进入 plan 模式（`/plan`）时，身份在整个规划会话期间切换为
  Prometheus，结束后切回。单个插件 `plan-aware-persona.mjs` 占用唯一的 `deployment:persona-prefix`
  槽位，通过读取公开的 `plan` session projection 在每次装配时选择文本。`planMode` service 被刻意
  **不**注入：它位于 `isolate: { planMode: true }` realm 内部，从外部注入永远不会解析成功。

在身份之外，preset 挂载了编码工具链：文件系统与 shell 工具、后台任务、skills、goals、plan mode、
compaction、委派与 workflows。该 declaration 共 40 条 `- id:` row，其中 9 条是锚定的子代理 row
（explore、librarian、oracle、momus、multimodal-looker、sisyphus-junior、metis、hephaestus、
sisyphus）。本包附带 **11 个 persona 文件**；插件自身读取 `atlas.md` 与 `prometheus.md`，另外 9 个
锚定在子代理 row 上。

## 随包内容

| 文件 | 用途 |
| --- | --- |
| `cordis.patch.yml` | 已发布的 bundle patch：preset 声明（`id: preset-omo-fork-chs`、`config.id: omo-fork-chs`、`config.name: 'Oh My DSH Chs - OMO Fork'`、`order: 11`）及其 `plugins:` 列表。共 540 行，11 处被改写。 |
| `plan-aware-persona.mjs` | 包入口，注册 plan-aware persona 前缀与配置的 suffix。以 `./persona` 导出。 |
| `index.js` | 包根。它刻意留空：bundle 的行为在 `cordis.patch.yml` 与 `./persona` 里。 |
| `personas/` | 11 个 persona 文件，已译为简体中文。 |
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

安装是**两个显式步骤**。第 1 步安装依赖；第 2 步告诉 profile 去加载它。两步都必需，并且不假设
`dsh` 在 `PATH` 上。

### 第 1 步：把包安装进 profile

把 CLI 指向你的 DSH checkout 的 bin 文件，并把安装转发给 profile：

```powershell
node "<dsh bin>" plugin --profile <profile> add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

例如，某个 checkout 的 runtime 是 `<dsh runtime>`，那么 `<dsh bin>` 就是
`<dsh runtime>\@deepseek-ai\dsh\lib\bin.js`，于是：

```powershell
node "<dsh runtime>\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

它会在 `$DSH_HOME\profiles\<profile>\` 内运行 pnpm，因此会写入一条 `dependencies` 记录。**它不会
改动 `dsh.profile.bundles`。**

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

然后**重启 Host 并新开一个会话。** 正在运行的 agent 保留它启动时的 composition，所以已经跑着的会话
不会加载这个 preset；必须新开会话。

### 验证安装已生效

```powershell
$env:DSH_HOME = "<dsh home>"
node "<dsh bin>" --profile <profile> --dump-config
```

输出中应当有一条 `preset-omo-fork-chs` row，其 `name` 为 `@deepseek-ai/dsh-agent-preset`，
`config.id` 为 `omo-fork-chs`，`config.name` 为 `'Oh My DSH Chs - OMO Fork'`，`config.order` 为
`11`，另有九条经由本包解析的 `personas` 表达式。`--dump-config` 打印的是原始 `!!js` 表达式文本，
所以那九条锚点呈现为 `resolve('<pkg>/package.json')` 形式，而不是解析后的文件系统路径。

## 安装后你可能需要自己做的改动

已发布的 patch **只**包含可移植的 preset 声明。有两样东西原本属于产出这个 fork 的那台机器，它们被
刻意**不**发布，因此你可能想自己把它们加回去：

1. **把 `omo-fork-chs` 设成默认 preset。** 已发布的 patch **不**设置默认 preset，本包也从不强加
   一个。如果你希望它成为默认，请在你自己的 profile 或 overlay patch 里自行设置 registry row：

   ```yaml
   - id: agent-preset-registry
     config:
       default: omo-fork-chs
   ```

   （`@deepseek-ai/dsh-web-app` 会插入同一条 row，但 `default: standard`；上面这条会替换整个
   config，所以只有 default 改变。）

2. **给 `subagent_multimodal_looker` 一条模型路由。** 产出这个 fork 的 bundle 曾为那条 row 带一条
   机器专属的 `provider` 与 `model` 路由，而那条路由**不可移植**，所以已发布的 patch 完全不包含
   `agentOptions` row。没有它时，多模态子代理会继承 deployment 的路由。若要固定一条，请在你自己的
   overlay 里给那条 row 加一个 `agentOptions` 块：

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

这是刻意的。空的 persona 前缀会悄悄剥掉 agent 的身份，所以一条点出文件名的挂载错误，远比一个安静地
丢掉自己指令的 agent 更容易处理。

## Peer 模型

patch 挂载的每个 `@deepseek-ai/*` 包都声明为 **`peerDependency`**，而不是普通 `dependency`。它们由
DSH 提供；bundle 不得安装自己的副本。peer 范围固定为 `>=0.1.7-rc.2 <0.2.0`（`@deepseek-ai/cordis`
为 `^4.0.1`）。本包声明 25 条 peer，且**没有**运行期依赖、**没有**开发依赖，因此测试与检查链中零依赖
的那部分都不需要安装任何东西。

DSH profile 的 `.npmrc` 设置了 `auto-install-peers=false`，所以这些 peer 是**纯声明式**的：pnpm 不会
去拉取它们，缺失的 peer 会在挂载时表现为解析错误，而不是被悄悄装上。

## 验证

下面全部在仓库根目录运行，且**无需安装**，只有 `check:full` 例外，它需要 runtime，并已如此标注。

```powershell
# 1. 测试套件。零依赖。55 个测试。
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

- **`npm run test`** 运行 `node:test` 套件：三组正向改写、反向改写及其往返、参数解析器、从两侧检验
  机器路径模式、零字节守卫，以及包检查的失败路径。共 55 个测试，不需要安装任何东西。
- **`npm run check`** 是 `node tools/check-package.mjs && node tools/verify-patch.mjs`。前者运行 19 条
  结构与许可断言（manifest 身份、四个 `exports`、唯一一条自引用 row、九条 persona 锚点及其文件、
  `files[]` 覆盖、11 个 persona 的字节数、许可指针、三份许可文档、绝不允许进入 tarball 的路径，
  对 `files[]` 所列每个目录的未跟踪文件检查，以及 npm 无论 `files[]` 如何都会自动收录的根目录文件、
  提供了上游指纹时的比对、
  修改声明的各项主张、许可范围映射及逐条把每个范围块钉到其所声明内容的锚点、机器路径扫描、
  约束移植前包名出现位置的类，以及 patch 的形状）。
  后者证明已发布的 patch 仍然等于三项已记录改写从冻结 baseline 算出的结果，并报告
  `verdict: "IDENTICAL"` 与 11 处改写点。两者都**零依赖**，因此在干净克隆里、无需安装即可通过。
- **`npm run check:full`** 就是单独运行 `node tools/verify-patch.mjs`。当 `DSH_RUNTIME` 指向一个包含
  `js-yaml` 与 `@deepseek-ai/cordis-plugin-include` 的绝对 `node_modules` 时，校验器会用真正的
  entry-list dialect 解析两份文档并做结构化比对，报告 `yamlCompare: "ok"` 与 `sites.length` 为 11。
  **没有 runtime 时它报告 `yamlCompare: "skipped"` 并仍然以 0 退出**，所以在这里只看退出码不算证据：
  必须断言字段。这也是为什么这一步与 `check` 分开，以及为什么存在 `npm run setup:verify`：它把
  runtime 装进 `.dsh-verify/`，而不给本包增加依赖。该工具自己读取 `DSH_RUNTIME`，而不是接受一个
  `--runtime` flag，因为 Windows 上 npm 通过 `cmd.exe` 运行脚本，而 POSIX shell 会展开变量，同一个
  脚本字符串在两个平台上的行为会不同。
- **`npm run baseline`** 通过对三项改写施加逆变换，从已发布的 patch 重新推导出
  `baseline/cordis.patch.yml`；`-- --check` 把已提交的 baseline 与一份新推导出的副本比对，打印出差异行
  并在出现漂移时以非零退出。
- **`npm run port -- --src <dir>`** 对 `<dir>` 里的 `cordis.patch.yml` 施加三项改写并写出结果。
  `--src` **没有默认值**，因为唯一诚实的默认值会是一个机器专属目录；错误消息把 baseline 目录作为
  替代来源点出来，而 `npm run port -- --src baseline` 会逐字节复现已提交的 patch。

> **`npm run check` 与 `npm test` 都必须在 git checkout 内运行。** 包检查的三条断言（许可范围映射、
> 机器路径扫描，以及约束
> 移植前包名出现位置的类）都定义在**受版本跟踪的**文件集合之上，所以该工具向 `git ls-files` 索取这个
> 集合。如果 git 无法回答，工具会以 `run inside a git checkout` 失败，而不是悄悄跳过这三条。`npm test`
> 出于同样的原因也需要检出：它的最后一个用例会针对真实目录树运行包检查，所以在仓库之外解包同样会失败。
> 因此，
> 在仓库之外解包已发布 tarball 的使用者会看到这个错误，而这是刻意的：一条对从未做过的工作报告成功的
> 映射检查，比没有检查更糟。已发布的包里包含这些工具与测试套件，所以这条链可以从克隆里重跑。

## 许可

本仓库是**双许可**的，且两个许可不是你可以二选一的关系：每个文件都恰好被其中一个覆盖。它**不是**
仅 MIT。

范围映射与 [`NOTICE.md`](./NOTICE.md) 中的两个块一致：

- [`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) 覆盖上游衍生内容：`personas/`、`cordis.patch.yml`、
  `plan-aware-persona.mjs`、`index.js` 与 `baseline/cordis.patch.yml`。
- [`LICENSE-MIT.md`](./LICENSE-MIT.md) 覆盖我们自己的作品：`tools/`、`test/`、`.github/`、
  `baseline/README.md`、`package.json`、`.gitignore`、`README.md`、`README.zh.md`、`CHANGELOG.md`
  与 `NOTICE.md`。
- [`NOTICE.md`](./NOTICE.md) 是权威声明：修改声明、上游署名，以及机器可读的许可范围映射，其中包含
  决定每个受跟踪路径归哪个块的匹配规则。若本 README 与 `NOTICE.md` 有任何不一致，以 NOTICE 为准。

上游条款是 **Sustainable Use License 1.0**，逐字保存在
[`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) 中。SUL-1.0 是一个 **source-available** 许可。它
**不是** OSI 批准的开源许可，本仓库也不作此主张。

上游条款只允许你为自己的内部业务目的，或为非商业、个人用途，去使用、复制、分发和制作衍生作品；
并且只允许你在**免费**且**非商业**的前提下分发。本包正是按这些条款分发：免费、非商业、不可转售。
上游许可是**不可再授权**的，这就是为什么覆盖我们自己文件的 MIT 许可无法延伸到上游衍生的文件之上，
也是为什么 `LICENSE-SUL-1.0.md` 必须随每一份副本一起传播。

MIT 范围上有一条界定：`tools/` 与 `test/` 下的文件是我们自己的作品、按 MIT 授权，但它们内嵌了上游
bundle patch 表达式的**逐字片段**，以便生成和校验该 patch。那些**逐字片段**仍受上游 SUL-1.0 条款
约束，并不会因为周围代码适用 MIT 而被重新授权。同一条界定也写在 `NOTICE.md` 里，两份文档一致。

本仓库是一个**非官方 fork**。它**未获**上游项目及其作者的背书、赞助或关联，这里也没有任何内容暗示
存在关联或背书。上游名称与商标归其所有者所有。

## 已知问题

- **声明的 peer 范围不含 dsh 0.2.0 及以上，宿主会在这类版本上跳过本 bundle。** peer 声明为
  `>=0.1.7-rc.2 <0.2.0`，与上游 fork 一致。在 0.2.0 或更高的 dsh 上，宿主会把该插件判为不兼容、
  **跳过该 bundle**，而命令**仍然以 0 退出**，所以除非去看 stderr，这个失败是静默的：preset 根本不会
  出现在 dump 里。在这类版本上，你必须要么使用落在声明范围内的 dsh，要么用
  `dsh plugin allow-version "<pkg>@<version>" --dsh-version <version> --accept-risk` 授予精确版本
  豁免。该豁免是宿主自带的逃生舱，并带有宿主自己警告过的风险，因此它是对风险的刻意接受，而不是受支持的
  配置。这一行为继承自上游 fork，并非本地化引入。在声明范围内的运行时上，本包能正确挂载并完成装配，包括
  全部九条 persona 锚点。
- **`baseline/` 证明的是可复现，而不是正确。** baseline 是移植前 patch 的冻结快照，提交它是为了让往返
  校验在任何地方都能跑。它与源 patch 逐字节一致，而这次推导证明移植是**可复现**的：已发布的 patch 与
  baseline 之间恰好由三项已记录改写相连，别无其他。它**不**证明内容正确。如果源 patch 本身是错的，
  这次推导会忠实复现那份错误，而这里所有检查依然会通过。
- **内容正确性的既有证据不随包发布。** 那份证据是简体中文移植工作产出的 `omo-fork-chs-*` 证据集，其中
  `verify-omo-fork-chs-bundle` 校验器报告 **`FAITHFUL`**，`verify-omo-fork-chs-deport` 校验器报告
  **`CLEAN`**。这些校验器是**机器相关**的：它们针对只存在于移植准备机器上的目录运行，并且刻意不随本包
  发布。
- **内嵌的 persona 正文带有机器本地路径。** 三份 persona 文档中一共十行写出了本地化工作所在机器上的
  绝对路径。它们违反了本仓库「任何提交的文件都不得写出机器绝对路径」的规则，之所以被容忍，只是因为与
  源 bundle 的字节一致性是更硬的约束。受影响的那些行在 `tools/check-package.mjs` 中逐条列举，该扫描
  只在这些确切位置接受匹配。`NOTICE.md` 把这件事记为修改条目 8。本文档不复制那些路径，因为它本身也
  在该扫描的覆盖范围内。
- **本仓库与英文 fork 并存。** `Tacrine/oh-my-dsh-omo-fork` 是一个独立仓库，有自己的包、自己的
  preset id 和自己的范围映射。两个仓库互不影响：它们共享上游血缘，而本包中没有任何内容读取、写入或
  依赖另一个。
- **0.1.0 是本仓库的首次发布，此前没有任何版本发布过。** 本包在 npm 上没有前身，因此没有更早的产物可
  供对照，也不存在从旧版本升级的路径。

## 源流

本包源自那份简体中文 agent-preset bundle，它当时以 **link 安装**的形态存在：一个接入某台机器 DSH
profile 的私有依赖，指向一个本地目录。那种形态无法安装到别处，因为它的 patch 写出的是机器本地的包名，
而它的 persona 锚点是相对于 profile 目录解析的。

本仓库把那份 bundle 变成**可从 npm 安装**的形态。三项已记录改写完成了这件事：包自引用与九条 persona
路径锚点被重新指向本包自己的名字及其 `package.json`，头部注释随之更新。结果是一个在任何安装布局下都能
解析的 patch、一份让往返校验不再需要原机器的冻结 baseline，以及一条证明已发布 patch 仍等于其来源的
检查链。

上游项目是 **oh-my-openagent**，曾以 **oh-my-opencode** 之名发布
（https://github.com/code-yeongyu/oh-my-openagent）。本仓库中的内容派生自上游 commit
`3c711483856207ef530c09d062fa9077c225debbe`，该 commit 对应上游版本 **5.0.1**。persona 正文、
工具链组成与插件都沿用上游设计；本 fork 的贡献是简体中文翻译与打包拆分。
