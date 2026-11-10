# 功能开关与分层规划

## 为什么不应只分“提示词注入 / 工具注入”

当前插件有四层，影响模型智能的主要是前两层：

| 层级 | 主要内容 | 对模型智能的影响 | 开关方式 |
| --- | --- | --- | --- |
| 宿主源码补丁 | 79 条补丁：沙箱、审批、文件围栏、工具结果修剪、提示词组装、身份句等 | 改变宿主行为，部分补丁也会改变模型看到的上下文 | 只能通过「应用 / 还原」整体管理，不在运行时开关里伪装成可逆 |
| 提示词注入 | `dsh-purge` 主注入、`CAPABILITY_SECTION`、`dsh-purge:probe`、`dsh-purge:post`、规则集、`excludePresets` | **高**：占用上下文、影响回答风格与推理预算 | `promptInject`、`capabilityProtocol` |
| Agent 循环 | 请求异常重试、空回答自动续跑、模型推脱单次重试 | **中到高**：改变轮次数量、可能放大重复行为 | `autoRetry`、`autoContinue`、`refusalRetry` |
| 红队工具 | 64 个 `redteam_*` 工具、演练台预设、资产库 | **中**：工具列表变长会占用工具选择预算，影响普通任务的工具判断 | `redteamTools`（下次宿主加载生效） |

## 开关矩阵

| 开关 | 默认 | 适用场景 |
| --- | --- | --- |
| `master` | 开 | 「全部功能」批量开关：勾选打开所有子项，取消关闭所有子项；同时作为运行时总闸 |
| `promptInject` | 开 | 需要绝对干净的上下文、或模型出现“被提示词带跑”时关闭 |
| `capabilityProtocol` | 开 | 不需要模型主动发现 skill / MCP 时关闭，减少上下文占用 |
| `autoRetry` | 开 | 网络/请求异常较多时保留；调试模型原始表现时关闭 |
| `autoContinue` | 关 | 容易产生额外轮次，默认关闭；长任务需要自动续跑时再开 |
| `refusalRetry` | 关 | 模型推脱明显时打开；正常任务建议关闭，避免改变原始输出 |
| `redteamTools` | 开 | 普通开发任务建议在「轻量模式」下关闭，减少 64 个工具对工具选择的干扰；切换后需重启宿主生效 |
| `hostPatches` | — | 运行功能下方的「宿主补丁」卡片：显示已应用 / 总数、待处理 / 跳过，提供应用、还原和重启按钮 |

## 总开关与「全部关闭」的边界

`master` 是运行时总闸，「全部开启」会把所有子项设为 true，「全部关闭」会把所有子项设为 false；关闭后：

- `promptInject`、`capabilityProtocol`、`autoRetry`、`autoContinue`、`refusalRetry`、`redteamTools` 的实际生效值全部为 false；
- 已有红队工具注册需要下次宿主加载才会撤下；
- `purge_*` 控制工具、设置页、自检、诊断、快照和更新等运维入口仍然可用；
- **宿主源码补丁不受影响**，仍由「应用 / 还原」单独管理。

设置页三档分段器会按当前组合显示「全部开启 / 轻量模式 / 全部关闭 / 自定义」，不再出现“总开关开着但子项全关”的歧义。

## 快捷模式

设置页「运行功能」提供三个一键按钮：

- **全部开启**：所有开关打开（含自动续跑与推脱重试）。
- **轻量模式**（推荐日常使用）：保留 `master`、`promptInject` 和 `autoRetry`，关闭 `capabilityProtocol`、`autoContinue`、`refusalRetry`、`redteamTools`；宿主补丁仍保持当前应用状态。
- **全部关闭**：全部开关置为 false，适合完全回到宿主默认运行时行为。

## 存储与接口

- 文件：`$DSH_HOME/dsh-purge/features.json`
- `GET /dsh-purge/features` 返回当前值与默认值。
- `POST /dsh-purge/features` 支持：
  - `{ "mode": "all" | "smart" | "none" }`
  - `{ "patch": { "promptInject": false } }`
- 代码入口：`lib/features.js`；UI 入口：`client.js` 的 `FeatureSection`。

## 设计边界

- `features.master` 只控制运行时行为，不虚假承诺“关掉宿主补丁”。宿主补丁的开关是「应用 / 还原」，因为补丁已经写入宿主源码，运行时无法无副作用地撤销。
- `redteamTools` 需要重新加载宿主后生效；提示词、自动重试、推脱重试是每次请求即时读取，改完下一轮生效。
- “轻量模式”保留核心破甲主提示词和请求异常重试，只关闭可能稀释上下文、改变轮次或增加工具选择负担的附加功能；“全部关闭”则连主提示词注入和自动重试也关闭。
