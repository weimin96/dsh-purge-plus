<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge-plus" width="720">
</p>

<h1 align="center">⚔️ dsh-purge-plus</h1>

<p align="center"><strong>DeepSeek Harness 破甲、提示词/工具开关与红队评测插件</strong></p>

<p align="center">
  <a href="https://github.com/weimin96/dsh-purge-plus">GitHub</a> ·
  <a href="https://github.com/weimin96/dsh-purge-plus/releases">Releases</a> ·
  <a href="CHANGELOG.md">CHANGELOG</a> ·
  <a href="docs/feature-switches.md">功能开关说明</a>
</p>

> 本项目基于 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)（原作者：小杨，MIT）持续整理。原项目署名、MIT 许可证与非商用条款保持不变，详见 [NOTICE.md](NOTICE.md) 与 [DISCLAIMER.md](DISCLAIMER.md)。

---

## 这是什么

`dsh-purge-plus` 是安装在本机官方 DeepSeek Harness 上的增强插件，把“破甲”、提示词注入、工具开关、红队演练和日常维护集中到 **设置 → Purge** 一处。

它解决三类问题：

1. **宿主层拦截**：通过 79 条源码补丁调整沙箱、审批、文件围栏、工具结果修剪、提示词组装等行为。
2. **模型层行为**：通过提示词注入、能力协议、自动重试/续跑等功能控制模型收到的上下文和运行轮次。
3. **可观测与可恢复**：内置自检、锚点漂移诊断、运行时探针、维护快照、更新前快照和功能开关。

> 宿主补丁需要点「应用」并重启宿主；运行时功能开关不写入宿主源码，可随时切换。

## 功能分层

| 层级 | 内容 | 入口 |
| --- | --- | --- |
| 宿主源码补丁 | 79 条补丁：沙箱、审批、文件系统、工具描述、提示词组装、身份句等 | 设置 → Purge → 应用 / 还原 |
| 提示词注入 | 主提示词、能力协议、探针、规则集、`excludePresets` | 设置 → Purge → 提示词 / 功能开关 |
| Agent 循环 | 自动重试、自动续跑、模型推脱重试 | 设置 → Purge → 运行功能 |
| 工具与红队 | `purge_*` 控制工具、64 个 `redteam_*` 工具、演练台、资产库 | 设置 → Purge → 演练台 |
| 维护 | 自检、诊断、探针、快照、回滚、更新偏好 | 设置 → Purge 顶部按钮 / CLI |

## 环境要求

- DSH **0.2.1-rc.2** 为主适配版本；DSH 0.2.2-rc.1 的锚点仍需逐条验证（`--selfcheck` 会如实报告漂移）。
- Node.js **≥18**；红队工具需要 Node **≥22.5**（依赖 `node:sqlite`）。
- 官方 `dsh web` 与官方桌面 EXE 分开安装、分别「应用」。

## 安装

### 当前机器 / 本地开发版

在项目目录执行：

```sh
dsh plugin --profile web add .
```

桌面端：在桌面版 DSH 的插件安装界面选择本目录或对应发行包；`desktop` profile 由 Electron 宿主独占，命令行直接管理会被拒绝。

### 从 GitHub 安装

```sh
dsh plugin --profile web add https://github.com/weimin96/dsh-purge-plus/archive/refs/heads/main.tar.gz
```

安装后：

1. 完全退出并重新打开 DSH；
2. 打开 **设置 → Purge**；
3. 点击 **应用**；
4. 应用成功会自动重启，重启后新开一轮对话。

## 常用命令

```sh
# 项目 CLI（在项目目录下执行；全局链接后也可直接调用 dsh-purge-plus）
dsh-purge-plus --status
dsh-purge-plus --host-status
dsh-purge-plus --apply
dsh-purge-plus --revert
dsh-purge-plus --selfcheck
dsh-purge-plus --diagnose
dsh-purge-plus --probe
dsh-purge-plus --backup
dsh-purge-plus --rollback <id>
dsh-purge-plus --usage
dsh-purge-plus --prune
dsh-purge-plus --refusal-retry on|off

# 会话命令
/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <压缩包或文件夹> | create <id> [说明] | delete <id> | help

# 模型工具
purge_status   purge_apply   purge_revert   purge_audit
```

## 功能开关（重点）

设置 → Purge 的「运行功能」支持一键模式与逐项开关：

| 开关 | 默认 | 说明 |
| --- | --- | --- |
| `master` | 开 | 运行时功能总开关；宿主补丁仍按「应用」状态生效 |
| `promptInject` | 开 | 主提示词注入；长上下文或模型表现变钝时关闭 |
| `capabilityProtocol` | 开 | 能力协议段；不需要 skill / MCP 引导时关闭 |
| `autoRetry` | 开 | 请求异常自动重试 |
| `autoContinue` | 关 | 空回答自动续跑；可能增加轮次，默认关闭 |
| `refusalRetry` | 关 | 模型推脱时单次重试 |
| `redteamTools` | 开 | 64 个红队工具；普通开发任务建议用「轻量模式」关闭；切换后需重启宿主 |
| 宿主补丁 | — | 运行功能下方的「宿主补丁」卡片：显示已应用 / 总数、待处理 / 跳过，提供应用、还原和重启按钮 |

- **全部开启**：打开所有运行时功能。
- **轻量模式**：保留宿主补丁、主提示词注入和请求异常自动重试；关闭能力协议、自动续跑、推脱重试和红队工具；适合日常编码。
- **全部关闭（运行时）**：所有运行时功能置为关闭，回到宿主默认运行时行为；宿主补丁仍需单独「还原」。

开关文件：`$DSH_HOME/dsh-purge/features.json`。接口：`GET/POST /dsh-purge/features`。详细设计见 [docs/feature-switches.md](docs/feature-switches.md)。

## 自检与维护

```sh
dsh-purge-plus --selfcheck   # 25 层：ok / pending / inferred / unknown / broken
dsh-purge-plus --diagnose    # 锚点漂移：文件、行号、候选片段
dsh-purge-plus --probe       # 30 分钟回显探针，验证注入是否到达模型
dsh-purge-plus --backup      # 创建插件/Profile 快照
dsh-purge-plus --rollback ID # 恢复插件文件
```

- `--selfcheck` 在宿主版本与补丁表不一致时会报 `broken` 或 `drifted`，这是自检在暴露真实差异。
- 更新前会自动创建快照；快照失败会中止更新。
- 维护快照位于 `$DSH_HOME/dsh-purge/backups/`。

## 目录结构

```text
bin/            CLI 入口
lib/            补丁引擎、提示词注入、工具、自检、维护与更新
lib/redteam/    红队工具、资产库、证据账本
presets/        redteam / unrestricted 预设
skills/         随包技能
client.js       设置页客户端 bundle
cordis.patch.yml  插件 bundle 配置
docs/           功能开关、对比分析等文档
test/           单元与回归测试
```

## 开发与验证

```sh
npm test          # node:test + gate + cwd 回归
npm run build:client
node --check lib/index.js
```

`npm test` 当前覆盖 19 个 node:test、71 个 gate 检查和 21 个 cwd 检查。

## 更新与还原

- 更新前自动快照，更新失败可按返回的 `backup_id` 回滚。
- `--revert` 还原宿主补丁，保留 `prompt-inject.md` 用户文件。
- `--rollback` 只恢复插件文件，不自动重启宿主。

## 署名与许可证

- 原项目：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)，原作者：小杨，MIT License。
- 本分支：`weimin96/dsh-purge-plus`，保留原作者署名、许可证和上游非商用条款。
- 二次开发、再分发请阅读 [NOTICE.md](NOTICE.md)；使用前提与责任边界见 [DISCLAIMER.md](DISCLAIMER.md)。
