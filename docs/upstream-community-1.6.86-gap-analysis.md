# dsh-purge-plus 与 dsh-purge Community 1.6.86 对比及演进建议

- 对比日期：2026-11-09
- 当前项目：`dsh-purge-plus` / `dsh-purge-plus@1.5.0`（`dshTarget: 0.2.1-rc.2`）
- 对比对象：[kingcharleslzy-ai/dsh-purge](https://github.com/kingcharleslzy-ai/dsh-purge) / `dsh-purge-community@1.6.86`（`master` @ `126caa2`，适配 DSH 0.2.2-rc.1 / 0.2.1-rc.1/2/3/5）
- 对比方法：模块清单、补丁表、HTTP 路由、测试与发布链路的静态核对；初稿阶段只运行了现有测试、未改代码。
- 本次已落地的首批增强：发布/更新身份收口、补丁 `expect` 命中契约、`patchStatusDetail` / `patchDrift`、25 层 `selfcheck`、`probe`、维护快照与更新前快照、`unrestricted` 预设、命令注册兜底。详见 [CHANGELOG.md](../CHANGELOG.md) 的 `1.5.0` 节。

---

## 1. 结论摘要

### 1.1 两个项目已经不是同一代

当前项目是从原上游 **1.2.0** 派生出的精简 fork：1 个压缩提交、79 条补丁、2 个测试文件、18 份文档。对比对象是独立演进的社区发行版：130 个提交、86 条补丁、98 个顶层测试文件、118 份文档，并且有完整安装器、维护 CLI、快照回滚、更新通道和跨平台 CI。

因此最有价值的做法不是“照抄一个功能”，而是参考它的**工程闭环**：

> 补丁有命中契约 → 状态能区分 pending / drifted / partial → 自检能逐层证明 → 探针能证明注入到达模型 → 操作前有快照 → 失败能回滚 → 发布与更新有独立身份。

### 1.2 最值得先做的五件事

| 优先级 | 事项 | 原因 |
| --- | --- | --- |
| P0 | 收口发布/更新身份 | 当前 `package.json`、`lib/update.js`、release workflow 全部指向 `YuJunZhiXue/dsh-purge`；本地分支是 `main`，workflow 却只在 `master` 上触发，并且 `if` 只允许原仓库。结果是 fork 既不能自己发版，点“更新”还可能把自己的代码覆盖成原上游。 |
| P0 | 补丁命中契约与漂移诊断 | 当前 `applyReplacementsToText` 是 replace-all，没有 `expect` 命中数；宿主升级后锚点消失会被当成 `skipped`/`unmatched`，面板不一定变红。上游用 `expect` + `multiHit` + `fileOptional` + `patchDrift` + `reanchor` 解决。 |
| P0 | `selfcheck` + `probe` | 当前只有 `status` 的补丁计数，不能回答“这一层是否真的生效”“注入是否真的到达模型”。上游 25 层自检和 30 分钟 nonce 探针是最直接的用户价值。 |
| P1 | 快照/回滚 + 维护锁 | 当前只有目标文件 `.dshpurge.bak`，没有插件包/Profile 快照。更新失败或补丁写坏时，恢复路径有限。 |
| P1 | 更新通道拆分 | 当前 `lib/update.js` 是 1120 行单文件；上游拆成 12 个模块，支持自动检查与自动安装分离、代理/镜像/Token、SHA256/Git Tree 完整性校验。 |

### 1.3 当前项目应保留的优势

不要为了“对齐上游”丢掉这些本地已经做得更好的模块：

| 模块 | 作用 |
| --- | --- |
| `lib/json-safe.js` | 严格工具输出 JSON 边界，避免 BigInt / 循环引用 / undefined 让宿主 500。上游没有等价模块。 |
| `lib/host-lease.js` | 写入前记录真实路径 + size + mtime + 头 64 KiB SHA-256，写后复核。上游 `atomic-files.js` 只保证原子替换，没有文件身份校验。 |
| `lib/tool-gate.js` | `audit` / `enforce` 两档审批 + 审计流水 + `purge_audit` 工具。上游只有审计，没有审批档位。 |
| `lib/revision.js` | 状态 CAS / 409 冲突处理，避免 Web 与桌面同时点“应用”互相覆盖。上游没有等价的通用机制。 |
| `lib/cwd-variable.js` | 0.2.1 的 `{{cwd}}` 未注册变量修复。这是本地分支最关键的兼容补丁之一。 |

建议的合并策略是**选择性回移（selective backport）**：以上述 5 个模块为本地核心，把上游对应能力适配进来，而不是整仓替换。

---

## 2. 量化对比

| 维度 | 当前项目 1.5.0 | 上游 Community 1.6.86 | 说明 |
| --- | --- | ---: | --- |
| DSH 目标 | 0.2.1-rc.2 | 0.2.2-rc.1 / 0.2.1-rc.1/2/3/5 | 本机当前安装的是 0.2.2-rc.1，当前插件已落后一个宿主代际 |
| 活跃补丁 | 79 | 86 | 去掉本地主动删除的 3 条 rewind 补丁后，实际可参考新增约 6 条 |
| `lib` 文件数 | 56 | 113 | 上游拆分出 `lib/patches/`、`lib/core/`、更新模块、维护模块 |
| 顶层 `lib` 文件 | 40 | 88 | 上游把单文件职责拆细 |
| HTTP 路由 | 15 | 22 | 上游新增 `/community`、`/diagnose`、`/selfcheck`、`/boost`、`/probe` 等 |
| 测试文件 | 2（608 行） | 98 个顶层测试文件（106 个含 fixtures） | 上游最新 release notes 记录 564 通过 / 22 跳过 |
| 文档文件 | 18 | 118 | 上游有 `AGENTS.md`、`MAINTENANCE.md`、`INSTALLATION.md`、逐版本 release notes |
| 脚本文件 | 8 | 50 | 上游有安装、诊断、Electron 验收、打包 smoke 等 |
| UI 组织 | 单文件 `client.js` 8,758 行 | `packages/purge-panel/src/` + esbuild + `check:client` | 上游 UI 可测试、可构建校验 |
| 更新实现 | 单文件 `lib/update.js` 1,120 行 | `update-*.js` 12 个模块 | 上游检查/安装/网络/完整性/状态分离 |
| CI | 1 个 release workflow，且被上游仓库条件锁死 | 5 个 workflow + Ubuntu/macOS/Windows 矩阵 | 上游有真实 Electron、Linux root、npm 安装回归 |

### 2.1 文件血缘

按同路径文件内容哈希比较：

- **53 个文件完全相同**：包括 `lib/rules.js`、`lib/rewind.js`、`lib/continue-retry.js`、`lib/redteam` 大部分文件、红队 skills、`scripts/build-client.mjs` 等。
- **30 个文件同名但已分叉**：`lib/core.js`、`lib/index.js`、`lib/identity.js`、`lib/desktop.js`、`lib/update.js`、`client.js` 等。
- **8 个仅当前项目有**：`cwd-variable.js`、`host-lease.js`、`json-safe.js`、`revision.js`、`tool-gate.js`、`compat-check.mjs`、`armor-prelude.mjs`、`drill-skin.mjs`。
- **111 个仅上游有**：补丁拆分、维护、更新、实例定位、自检、预设、面板构建等。

这说明两边共享同一祖先，适合按模块逐步吸收，而不是重写。

### 2.2 补丁差异

上游 86 条 vs 本地 79 条，精确差集：

| 类别 | 补丁 |
| --- | --- |
| 上游有、本地无，但本地 1.4.2 主动删除 | `#56 REWIND_HIDE_CUT_ONLY`、`#75 REWIND_RESET_TODOS`、`#77 REWIND_DROP_SENT_ON_APPEND` |
| 本地有、上游已用新版替代 | `#85 SESSION_PROMPT_ALWAYS_FOLLOWUP`、`#86 SESSION_STEER_ALWAYS_FOLLOWUP` → 上游 `#90 RESTORE_NATIVE_STEERING` |
| 真正值得回移的新补丁 | `#89 ASK_USER_WAIT_CAPPED`、`#90 RESTORE_NATIVE_STEERING`、`#91 BROWSER_COOKIE_NAME_IGNORE_PORT`、`#92 HOST_MAX_HTTP_HEADER_SIZE`、`#93 SANDBOX_POLICY_BRAND_NEUTRAL`、`#94 SKILL_BADGE_DESCRIPTION_NEUTRAL` |

其中 `#91/#92` 解决桌面端随机端口累积 `dsh-auth-*` cookie 导致请求头超过 16KB、启动报 431 的问题；`#93/#94` 是去品牌化文案补丁。它们和本地已有的“破甲内核”不冲突。

---

## 3. 值得参考的设计与模块

### 3.1 补丁引擎：从“能打上”到“可证明打上了”

参考文件：

- [lib/patches/index.mjs](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/patches/index.mjs)：把补丁表拆成 `prompt / code / engine / new-tools / opt-in` 五个模块。
- [lib/core/verify.mjs](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/core/verify.mjs)：`applyReplacementsToText`、`rollupPatchStatus`、`patchStatusReady`。
- [lib/core.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/core.js)：`patchDrift`、`patchStatusDetail`。

上游补丁元数据比本地多这些字段：

| 字段 | 语义 | 当前项目现状 |
| --- | --- | --- |
| `expect: n` | 该 pattern 必须正好命中 n 次；0 次也算失败，整条拒写 | 没有；replace-all 会静默改掉所有出现位置 |
| `multiHit: true` | 明确允许某锚点在原始宿主出现多次（如文案在普通/PTC 两套描述里） | 没有 |
| `fileOptional: [key]` | 该目标不参与 `partial` 判定，但仍逐文件报告 | 没有 |
| `fileAllRequired: true` | 多文件补丁每个目标都必须落地，否则 `partial` | 没有 |
| `chainedAfter: id` | 前置补丁未落地时，后置补丁不算漂移 | 没有 |
| `settleWhenAbsent: true` | 撤除型补丁在目标本来不存在时视为已到位 | 没有 |
| `disabledByDefault` / `optIn` | 默认关闭、通过 `tuning.extraPatches` 显式开启 | 没有 |

上游的状态模型也更完整：

```text
applied / already / pending / drifted / partial / unmatched / skipped / missing_file / na / off / disabled / unknown
```

当前本地 `patchStatus` 只有 `pending / applied / unmatched / skipped / missing_file / na`。关键差别是**上游把“文件在、锚点不在”判为 `drifted`，而不是 `skipped`**。这能避免宿主升级后补丁悄悄失效而面板仍然显示正常。

上游还提供了 `patchDrift()`：对每条补丁的每个锚点给出文件、锚点原文首行和候选新落点，再通过 `anchors.js` + `reanchor` CLI 把确认的新片段写进 `$DSH_HOME/dsh-purge/anchor-overrides.json`，不改插件源码，随时可清除。当前项目只有开发期的 `scripts/compat-check.mjs` 临时复制文件跑一遍，用户侧没有诊断与修复路径。

### 3.2 自检与运行时探针

参考文件：

- [lib/selfcheck.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/selfcheck.js)：`BYPASS_LAYERS` 22 个宿主补丁层 + runtime/config/layout 3 层 = 25 层；每层状态 `ok / pending / inferred / unknown / broken`。
- [lib/probe.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/probe.js)：写入一次性 nonce，系统提示词要求模型原样回显；30 分钟 TTL。
- `purge-community selfcheck [--json]`、`diagnose`、`probe new`、`host-status`。

为什么值得参考：

- 当前状态页只告诉用户“补丁 X/Y applied”，不能告诉用户“沙箱直通层是否真的在”“运行时注入是否真的进入模型上下文”。
- `probe` 能直接区分“模型层拒绝”和“宿主层没注入”，这是插件排障最核心的二分。
- 自检状态允许 `pending`（待应用）、`inferred`（宿主推导）、`unknown`（证据不足）和 `broken`（确认故障）分开，不会把未知伪装成绿色。

### 3.3 维护、快照与回滚

参考文件：

- [lib/community.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/community.js)：`Maintenance` 类，提供 `list / backup / snapshot / verify / rollback / usage / prune / install`。
- [lib/rollback-transaction.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/rollback-transaction.js)：安装前 checkpoint profile 的 `package.json`、`pnpm-lock.yaml`、`node_modules`，失败恢复。
- [lib/maintenance-lock.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/maintenance-lock.js)：跨进程维护锁，硬链接 + PID 出生时间校验；不把“锁年龄”当死亡证据。
- [lib/path-boundary.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/path-boundary.js)：防 `..`、符号链接、junction 的路径包含校验。
- [lib/atomic-files.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/atomic-files.js)：原子替换并保留原文件权限。
- `lib/remove-tree.js`、`lib/restore-backup.js`。

快照格式要点：

- `$DSH_HOME/dsh-purge-community/backups/<id>/manifest.json` + `objects/` 内容寻址去重；
- manifest 记录每个文件的 SHA256、原 profile、Purge bundles；
- 默认保留最近 5 份、每天 1 份共 7 天、总大小 200MB；
- `usage` / `prune` / `rollback <id>` 是用户可操作入口；
- 回滚前再快照当前状态，避免二次损坏。

当前项目只有 `backupAll()` 生成 `.dshpurge.bak`，没有插件包/Profile 快照，也没有维护锁和 `prune`。这是“更新失败后无法回到上一版”的主要风险。

### 3.4 更新子系统

参考文件：

- [lib/update-policy.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/update-policy.js)：`autoCheck` 与 `autoInstall` 分离，默认只检查；`intervalHours` 1–168。
- [lib/update-http.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/update-http.js)：重定向白名单、代理选择、GitHub Token、状态码分类。
- [lib/update-mirror.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/update-mirror.js)：镜像只作为传输层，不能成为校验权威。
- [lib/update-integrity.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/update-integrity.js)：旧源码归档先固定 commit，再按 GitHub Git Tree 逐文件校验；正式 TGZ 走 SHA256SUMS。
- `update-download.js`、`update-install.js`、`update-state.js`、`update-secrets.js`、`update-system-proxy.js`、`update-socks.js`、`update-targets.js`。

当前 `lib/update.js` 只有 stable/beta 两通道、GitHub/jsdelivr 重定向白名单和版本历史；没有检查/安装分离，没有代理/Token/镜像，也没有安装前快照。若以后要支持更多网络环境，按模块拆分比继续加 if 更稳。

### 3.5 实例定位与桌面身份

参考文件：

- [lib/instance.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/instance.js)：只定位当前实例，不扫 PATH、不扫其他安装；优先级 `--profile` / `PURGE_PROFILE_DIR` / 启动参数 / `DSH_PROFILE` / 唯一已初始化 profile。
- [lib/host-layout.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/host-layout.js)：只读证据区分 `archive_entry` / `unpacked_entry` / `different_instance` / `unknown_runtime`。
- [lib/desktop-identity.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/desktop-identity.js)：按包内容识别 `bundled-host` / `bundled-cli` / `community` / `next`，不靠 exe 文件名。
- `macos-asar-handoff.js`、`windows-asar-handoff.js`、`desktop-handoff.js`、`install-registry.js`。

当前 `findPurgeProfiles()` 会扫描 `$DSH_HOME/profiles/*` 下所有带 `dsh-purge` 依赖的 profile，更新时可能对多个 profile 同时操作；桌面端与 Web 端、便携版、NEXT 壳的边界没有上游清楚。这是“多实例误更新”的根源。

### 3.6 预设管理

参考文件：

- [lib/presets-plugin.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/presets-plugin.js)：把 `unrestricted` 预设注册到 `agentPresets`，不是只丢文件夹。
- [lib/preset-compat.js](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/preset-compat.js)：处理 DSH 0.2.1 移除 `toolFilter` 后的旧预设迁移。
- `lib/preset-injection.js`：`excludePresets` 按当前预设排除 Purge 注入，子 Agent 用自己有效的预设判断。
- `presets/unrestricted/`。

当前项目只有 `presets/redteam`，没有通用 `unrestricted` 预设注册，也没有 `excludePresets`。如果用户使用角色扮演/极简预设，当前注入无法按预设排除，容易互相覆盖。

### 3.7 红队证据账本

参考文件：[lib/redteam/evidence-ledger.mjs](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/lib/redteam/evidence-ledger.mjs)（516 行）。

- 四档置信度：`claimed / observed / derived / inferred`；
- `claimed` 与 `inferred` 必须核实；
- 每条证据 `ev_id = sha256(规范化语义)`，改一个字哈希就变；
- `residual_unknown` 记录“还没打完、证据不足”的问题，支持 `open / investigating / blocked / contradicted / resolved / withdrawn`；
- 另有 `lib/redteam/atomic-write.js` 原子写设置文件。

当前 `lib/redteam` 与上游 53 个共享文件里大部分已一致，只差这两个模块。回移成本低、收益明确。

### 3.8 UI 与面板工程

参考文件：[packages/purge-panel](https://github.com/kingcharleslzy-ai/dsh-purge/tree/master/packages/purge-panel) 和 [scripts/build.mjs](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/packages/purge-panel/scripts/build.mjs)。

- 源码拆成 `src/components/`、`src/state/`、`src/styles/`、`src/api/`；
- esbuild 打包成 `client.js`，`npm run check:client` 校验“签入产物 = 源码构建结果”；
- `packages/purge-panel/test/` 有 15+ 个 UI 测试；
- 设置页、维护页、补丁状态、重启、欢迎页、回退菜单分组件维护。

当前 `client.js` 是 8,758 行单文件，`scripts/build-client.mjs` 只负责把 `lib/redteam/client.js` 嵌进去。继续在单文件上改，UI 状态和样式会越来越难维护。

### 3.9 工程流程与文档

- [AGENTS.md](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/AGENTS.md)：面向 agent 的操作说明（心智模型、CLI 表、排障决策树、文件边界）。
- [docs/MAINTENANCE.md](https://github.com/kingcharleslzy-ai/dsh-purge/blob/master/docs/MAINTENANCE.md)：维护、迁移、恢复、Windows 换包状态。
- `scripts/check-docs.mjs`：版本号、`release-notes.md` 首行、README、AGENTS 版本一致性检查。
- `.github/workflows/community.yml`：Ubuntu/macOS/Windows 矩阵、真实 Electron 44.7.0、Linux root 审计、npm 安装/升级/回滚。
- `scripts/smoke.mjs`：`npm pack` 后解包、导入所有入口、解析预设、检查 bundle patch。

这些不是“锦上添花”，而是上游能在 1.6.86 维持 98 个测试文件和 86 条补丁的基础。

---

## 4. 建议补充的功能清单

### P0：先修正确性与可恢复性

| # | 功能 | 参考实现 | 建议验收标准 |
| --- | --- | --- | --- |
| 1 | 发布/更新身份收口 | 上游 `package.json` 的 `name: dsh-purge-community`、自有 `dsh.install.tarball`、`lib/update-net.js` 的 `SOURCE_REPO` | `package.json` 的 `repository / homepage / bugs / dsh.install.*` 全部指向本地仓库；`lib/update.js` 的 `REPO` 改为本地仓库；release workflow 触发分支与仓库条件匹配当前 `main`；更新只从本地 release 拉包 |
| 2 | 补丁命中契约 | `lib/core/verify.mjs` 的 `expect / multiHit`；`test/expect-contract.test.mjs` | 给所有字面量锚点加 `expect: 1`（或明确 `multiHit`）；新增测试：多命中/0 命中必须拒写并返回 `hitMismatch` |
| 3 | 漂移状态与诊断 | `patchDrift()`、`patchStatusDetail()`、`anchors.js`、`bin/community.js reanchor` | `status` 能显示 `drifted / partial / unknown / disabled`；`diagnose` 返回每个未命中锚点的文件、行号、候选片段；`reanchor list/show/apply/clear` 可覆盖且不改源码 |
| 4 | 自检与探针 | `lib/selfcheck.js`、`lib/probe.js`、`/dsh-purge/selfcheck`、`/dsh-purge/probe` | CLI/面板能按 25 层显示 `ok/pending/inferred/unknown/broken`；`probe new` 生成 nonce，模型回显即证明注入链路；无宿主时自检返回 `broken` 而不是抛异常 |
| 5 | 快照/回滚与维护锁 | `Maintenance`、`rollback-transaction.js`、`maintenance-lock.js`、`path-boundary.js` | `backup` 生成带 SHA256 manifest 的快照；`rollback <id>` 能恢复包和 profile 依赖；并发 maintenance 第二个进程得到 `MAINTENANCE_BUSY`；`prune` 按 5/7 天/200MB 清理 |

### P1：体验与维护效率

| # | 功能 | 参考实现 | 建议验收标准 |
| --- | --- | --- | --- |
| 6 | 更新通道拆分 | `update-policy.js`、`update-http.js`、`update-mirror.js`、`update-integrity.js` | 自动检查与自动安装分开，默认只检查；支持 1–168 小时间隔；代理/镜像/Token 可选且密钥文件权限 0600；TGZ 校验 SHA256，源码归档校验 Git Tree |
| 7 | 多实例/桌面身份 | `instance.js`、`host-layout.js`、`desktop-identity.js` | 只操作当前实例；`--profile` / `DSH_PROFILE` / `PURGE_PROFILE_DIR` 解析有测试；`host-status` 区分 archive/unpacked/different_instance/unknown_target |
| 8 | 预设管理 | `presets-plugin.js`、`preset-compat.js`、`preset-injection.js` | 新会话下拉出现 `unrestricted`；旧 `toolFilter` 预设自动迁移并保留原文件备份；`excludePresets` 对主会话/子 Agent/宿主兜底一致生效 |
| 9 | 维护面板 | `packages/purge-panel/src/components/maintenance.js`、`/dsh-purge/community` | 面板显示备份数量/占用、最近动作、更新偏好；支持手动备份/回滚/prune；错误显示具体阶段而不是“失败” |
| 10 | 命令注册兜底 | `lib/command-registration.js` | `/purge` 被其他插件占用时自动退到 `/purge-community`，仍冲突则跳过并警告，不阻止插件启动 |

### P2：红队与增强能力

| # | 功能 | 参考实现 | 建议验收标准 |
| --- | --- | --- | --- |
| 11 | 证据账本 | `lib/redteam/evidence-ledger.mjs`、`redteam/atomic-write.js` | 证据有 `claimed/observed/derived/inferred`；语义哈希稳定；`claimed` 必须核实；`residual_unknown` 可查询/撤回；设置文件原子写 |
| 12 | 拒绝检测/单次重试 | `lib/refusal-retry.js`、`lib/stream-observation.js` | 只在流开头缓冲 400 字符检测拒绝；命中后丢弃本次输出、加一次提示重跑；默认关闭，审计记录命中规则 |
| 13 | 尾部强化段 | `lib/boost.js`、`lib/tuning.js` | 开关可配置；默认位置可 head/tail/both；与本地现有内核不重复注入 |
| 14 | 兼容矩阵 | `package.json` 的 `dsh.compatibility`、`QUALIFIED_HOST_VERSIONS` | 至少覆盖 0.2.1-rc.1/2/3/5 和 0.2.2-rc.1；未知版本允许安装但标“未验证”；每条补丁有宿主源码回归测试 |

---

## 5. 工程优化建议

### 5.1 拆分 `lib/core.js`

当前 `lib/core.js` 7,871 行，同时包含补丁定义、应用引擎、宿主路径、备份、状态、shim、prompt 常量。上游把它拆成：

```text
lib/patches/{prompt,code,engine,new-tools,opt-in,index}.mjs
lib/core/{shared,verify}.mjs
lib/core.js（宿主路径/应用/备份编排）
```

建议先做**机械拆分**：把 `PATCHES / CODE_PATCHES / ENGINE_PATCHES / NEW_TOOL_PATCHES` 原样搬到 `lib/patches/*`，`applyReplacementsToText / rollupPatchStatus / patchStatusReady` 搬到 `lib/core/verify.mjs`，`core.js` 保留 re-export 兼容旧引用。这样后续回移补丁字段时不会在 7,000 行文件里做外科手术。

### 5.2 拆分 `client.js`

把 `client.js` 改为 `packages/purge-panel/src/` 的构建产物：

- `src/entry.js` 只负责注册 `settings.section` / `shell.overlay`；
- 组件按 `components/` 拆；
- `esbuild` 输出 `client.js`，CI 跑 `check:client` 防“源码改了、产物没更新”；
- 为补丁状态、更新、重启、备份/回滚加组件级测试。

这是低风险、高回报的维护性优化：即使不马上改 UI，也能先建立“源码 → 产物”的单一真相源。

### 5.3 测试体系

当前只有 2 个测试文件（`test/gate.mjs` 71 项、`test/cwd-variable.mjs`）。建议按上游清单先补 12 个高价值测试：

1. `patch-anchors.test.mjs` — 每条补丁的真实宿主源片段回归；
2. `expect-contract.test.mjs` — 命中数 0/1/多；
3. `drift-status.test.mjs` — `drifted` 不判绿；
4. `partial-status.test.mjs` — 多目标部分命中；
5. `selfcheck.test.mjs` — 25 层汇总与 `unknown` 语义；
6. `probe.test.mjs` — nonce TTL / 回显提示；
7. `atomic-files.test.mjs` — 权限保留、失败无残留；
8. `host-backup.test.mjs` — 备份/还原字节一致；
9. `update-policy.test.mjs` — 检查/安装分离、间隔范围；
10. `update-integrity.test.mjs` — Git Tree / SHA256 失败路径；
11. `instance.test.mjs` — profile 解析与多实例拒绝；
12. `preset-injection.test.mjs` — `excludePresets` 主/子 Agent 一致。

同时增加 `npm test` 脚本（当前没有），让 CI 能一键跑全量；`test:cwd` 目前在本机 0.2.2-rc.1 环境中因 host renderer 路径未覆盖 macOS nvm 安装而出现 2 个误报失败（`renderPrompt is not a function`），建议把 renderer 发现逻辑抽成 `findHostRenderer()` 并像上游一样找不到就显式 skip。

### 5.4 发布与文档一致性

立即可做：

- `package.json` 的 `repository / homepage / bugs / dsh.install.tarball/zip/git` 改成本地仓库；
- `lib/update.js` 的 `REPO` 改成本地仓库；
- `.github/workflows/release.yml` 的 `on.push.branches` 改为 `main`，`if` 改为 `github.repository == 'weimin96/dsh-purge-plus'`；
- 增加 `scripts/check-docs.mjs`：校验 `package.json`、`release-notes.md` 首行、`README.md`、`README.zh-CN.md`、`NOTICE.md` 的版本一致；
- 清掉 `client.js` 中“82 个锚点”的旧文案（当前实际 79 条），`NOTICE.md` 中“1.3.1”也更新到当前版本；
- 增加 `package-lock.json`（当前项目没有 lockfile），保证文件写入与打包可复现。

### 5.5 CI 与验收

按风险分三层：

| 层级 | 内容 |
| --- | --- |
| 每次 push | `node --check` 全部入口；`npm test`；`npm run check:client`（若拆分 UI）；`npm pack` + `scripts/smoke.mjs` |
| 每次 release | Ubuntu/macOS/Windows 三平台矩阵；真实 Electron 交接测试；Linux root/服务用户审计测试 |
| 宿主升级 | `compat-check --asar` 跑完整补丁表；`selfcheck --json` 逐层留证；`patch-anchors` 真机锚点回归 |

---

## 6. 不建议直接照搬的部分

1. **不要重新加回 rewind 三件套**：本地 1.4.2 已按用户要求删除输入框“回退”按钮、`/rewind` 路由和 `#56/#75/#77` 三条补丁。上游 1.6.86 仍保留回退菜单，这是产品差异，不是落后。
2. **不要直接改包名为 `dsh-purge-community` 或复制社区市场索引**：上游用独立包名、独立 release 和 `purge-community` CLI 解决“与原作者 npm 包冲突”的问题。本地要先决定自己是“内部 fork”还是“对外发行版”；包名、CLI、数据目录、市场索引需要一起设计，不能只改一个字段。
3. **不要复制 `region gate` 的取舍**：上游 1.6.52 明确移除公网目标请求门禁（`test/no-region-gate.test.mjs`），本地 `lib/net-scope.js` 仍导出并安装 `installRegionGate`。这是产品定位选择，应该显式决定“保留 / 默认关闭 / 可选插件”，而不是无意识地继承旧行为。
4. **不要把上游 `boost` 段直接叠加到本地内核**：本地 `scripts/armor-prelude.mjs` 已经有两段硬约束（Authority/precedence + Final gate），上游 `BOOST_TEXT` 也是长段尾部强化；直接叠加会重复占 token，甚至产生相互矛盾的措辞。应先做 A/B 对比，再决定替换还是合并。
5. **不要引入 Node 22.5 硬依赖**：上游红队工具依赖 `node:sqlite`，低版本会在加载时失败；本地 `package.json` 仍声明 Node >=18。若回移 evidence ledger，需要确认是可选加载还是提升 engines 并写清升级路径。
6. **不要照搬上游的 `client.js` 全量 UI**：上游 UI 仍包含本地已删除的回退按钮、欢迎页等组件；本地已经有自己的设置页和演练台交互。应该参考其**构建方式与组件拆分**，而不是复制整份 UI。

---

## 7. 建议路线图

### Phase A：一周内，先把“不会把自己搞坏”解决

1. 发布/更新身份收口（P0-1）。
2. 补丁 `expect` / `multiHit` / 状态 `drifted` / `partial`（P0-2）。
3. `selfcheck` + `probe` 最小可用（P0-4）。
4. 补 `patch-anchors`、`expect-contract`、`drift-status`、`selfcheck`、`probe` 测试。
5. 修复 `test:cwd` 的 host renderer 发现逻辑与 `82` 文案。

### Phase B：两到三周，补“可恢复与可维护”

1. 搬 `Maintenance` + `rollback-transaction` + `maintenance-lock` + `path-boundary`（P0-3/P0-5）。
2. 拆 `lib/core.js` 为 `lib/patches/*` + `lib/core/verify.mjs`。
3. 拆 `lib/update.js` 为 `update-*` 模块，接上检查/安装分离与完整性校验（P1-6）。
4. 面板加维护页：备份、回滚、prune、最近动作、更新偏好（P1-9）。

### Phase C：三到六周，补“多实例、预设与红队”

1. `instance.js` / `host-layout.js` / `desktop-identity.js`（P1-7）。
2. `presets-plugin` / `preset-compat` / `excludePresets`（P1-8）。
3. `evidence-ledger` + `atomic-write`（P2-11）。
4. `client.js` 迁移到 `packages/purge-panel` 构建（5.2）。
5. CI 三平台矩阵 + `check-docs` + `AGENTS.md` / `MAINTENANCE.md`（5.4/5.5）。

---

## 8. 附录：可参考文件索引

| 能力 | 上游文件 |
| --- | --- |
| 补丁表拆分 | `lib/patches/prompt.mjs`、`code.mjs`、`engine.mjs`、`new-tools.mjs`、`opt-in.mjs`、`index.mjs` |
| 补丁应用/状态 | `lib/core/verify.mjs`、`lib/core.js`（`patchDrift`、`patchStatusDetail`） |
| 锚点覆盖 | `lib/anchors.js`、`bin/community.js`（`reanchor` 子命令） |
| 自检 | `lib/selfcheck.js`、`lib/permission-state.js`、`lib/preset-diagnostic.js` |
| 运行时探针 | `lib/probe.js` |
| 维护/快照 | `lib/community.js`、`lib/rollback-transaction.js`、`lib/restore-backup.js`、`lib/maintenance-lock.js`、`lib/path-boundary.js`、`lib/atomic-files.js`、`lib/remove-tree.js` |
| 更新 | `lib/update.js`、`lib/update-policy.js`、`lib/update-http.js`、`lib/update-download.js`、`lib/update-install.js`、`lib/update-integrity.js`、`lib/update-mirror.js`、`lib/update-state.js`、`lib/update-secrets.js`、`lib/update-system-proxy.js` |
| 实例/桌面 | `lib/instance.js`、`lib/host-layout.js`、`lib/desktop-identity.js`、`lib/desktop-handoff.js`、`lib/macos-asar-handoff.js`、`lib/windows-asar-handoff.js`、`lib/install-registry.js` |
| 预设 | `lib/presets-plugin.js`、`lib/preset-compat.js`、`lib/preset-injection.js`、`presets/unrestricted/` |
| 红队证据 | `lib/redteam/evidence-ledger.mjs`、`lib/redteam/atomic-write.js` |
| UI 构建 | `packages/purge-panel/src/`、`packages/purge-panel/scripts/build.mjs` |
| 文档/CI | `AGENTS.md`、`docs/MAINTENANCE.md`、`docs/INSTALLATION.md`、`scripts/check-docs.mjs`、`.github/workflows/community.yml`、`scripts/smoke.mjs` |

---

## 9. 本次核对到的本地问题清单（可直接作为 issue）

1. `package.json` 的 `repository / homepage / bugs / dsh.install.*` 仍指向 `YuJunZhiXue/dsh-purge`（`package.json:65-92`）。
2. `lib/update.js:12` 的 `REPO = "YuJunZhiXue/dsh-purge"`，更新会拉原上游，不是本地 fork。
3. `.github/workflows/release.yml` 只监听 `master`，当前分支是 `main`；且 `if: github.repository == 'YuJunZhiXue/dsh-purge'` 会让本地仓库永远不执行发布。
4. `client.js` 中 `purge.lead` 仍写“82 个锚点”，实际补丁 79 条（`client.js:188`）。
5. `NOTICE.md` 版本表仍写 `1.3.1`，当前 `package.json` 是 `1.4.2`。
6. `test/cwd-variable.mjs` 在 macOS nvm 安装的 0.2.2-rc.1 上找不到 renderer 后没有走 `requireRenderer`，导致 2 个 `renderPrompt is not a function` 误报；需要补 macOS/Linux 路径或统一 skip。
7. `package.json` 没有 `test` 脚本，CI 无法一条命令跑全量。
8. `test/gate.mjs` 的 `auditPath` 使用 `Z:\\nope\\nested`，在 POSIX 上会被当成普通相对路径，运行后会在仓库根创建 `Z:\\nope\\nested/audit.jsonl`；应改用 `os.tmpdir()`（本次运行后已清理）。
9. `lib/core.js` 7,871 行、`client.js` 8,758 行，均无模块边界；`lib/core.js` 同时承担补丁定义与执行引擎，新增补丁字段的成本很高。

---

## 10. 一句话建议

**先修“身份与证据链”，再搬“维护与更新”，最后做“UI 与红队增强”。** 上游 Community 1.6.86 最值得参考的不是 86 条补丁本身，而是它把每条补丁、每次修改、每次更新都做成**可诊断、可回滚、可复现**的工程系统；当前项目只要把这条主线补上，就能在不丢掉自身独特模块的前提下，获得同一代的可靠性。
