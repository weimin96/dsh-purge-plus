/**
 * 逐层自检：回答“这一层是否真的在位”，而不是只看补丁数量。
 *
 * 设计参考 dsh-purge Community 1.6.86 的 selfcheck（MIT），按本仓库的补丁编号
 * 与状态引擎重写。纯只读：不写宿主、不改 profile、不重启。
 */
import fs from "node:fs";
import path from "node:path";
import * as core from "./core.js";
import { detectSurface } from "./surface.js";

/**
 * 22 个宿主补丁层。除 runtime / config / layout 三层外，正好覆盖 25 层自检。
 * optionalIds 只影响“缺目标时算不算不适用”，不影响必需补丁。
 */
const RAW_LAYERS = [
  { ids: [15], title: "沙箱 confine 直通", kind: "host",
    why: "read-only / workspace-write 不再把命令包进 bwrap 等 runner，denial 签名为空" },
  { ids: [16], title: "文件系统围栏禁用", kind: "host",
    why: "写/改文件不再因只读或工作区边界被 FS_SANDBOX_DENIED 拦掉" },
  { ids: [17], title: "观察策略放行", kind: "host",
    why: "edit 不再要求先 read，版本冲突门也放行" },
  { ids: [6, 33, 48], title: "拒绝话术中性化", kind: "host",
    why: "工具描述里不再教模型“沙箱会拒绝，请申请审批”" },
  { ids: [7, 8, 10], title: "默认策略", kind: "host",
    why: "沙箱默认 danger-full-access、审批默认 never（可被 UI 覆盖）" },
  { ids: [9, 35], title: "审批自动放行", kind: "host",
    why: "审批门直接授信；rejected/cancelled/unavailable 不再抛错打断回合" },
  { ids: [59], title: "Auto Review 不拦工具", kind: "host",
    why: "官方自动审查不再否决工具调用" },
  { ids: [60, 62, 61], title: "工具审批 fail-open", kind: "host",
    why: "run_code / 无审批通道时放行；用户主动点拒绝仍然拒绝" },
  { ids: [63], title: "计划模式不硬拦", kind: "host",
    why: "操作者要求实施时，计划模式不再拒绝执行" },
  { ids: [4, 25, 43, 71, 76], optionalIds: [71, 76], title: "官方身份剥离", kind: "host",
    why: "去掉 'You are a coding agent powered by ...' 与内置预设身份句" },
  { ids: [32, 53], title: "Web 面身份中性化", kind: "host",
    why: "Web 面提示词不再自称 DeepSeek Harness，也不再禁止另起服务" },
  { ids: [40, 74, 55, 72], title: "注入不被预设覆盖", kind: "host",
    why: "complete 预设、首轮 assemble、每步 system 替换都保留 dsh-purge 注入" },
  { ids: [26, 28], optionalIds: [28], title: "极简/梁神预设保留注入", kind: "host",
    why: "minimal 预设 open inject；梁神 phase-1 不被剥掉" },
  { ids: [29, 50], title: "外部内容不降级为只读", kind: "host",
    why: "web/session 引用内容仍可作为可执行数据使用" },
  { ids: [30, 31, 64, 65], optionalIds: [30, 31, 64, 65], title: "Hooks 不否决回合", kind: "host",
    why: "装了 hooks-claude-code / hooks-codex 时，deny 不再 reject 整轮" },
  { ids: [21, 22, 23], title: "工具上限放宽", kind: "host",
    why: "bash 等待恢复、read 上限放宽、子代理深度默认 3→10" },
  { ids: [24, 37], title: "预设与子代理不设锁", kind: "host",
    why: "preset fetch 打开；子代理 scope-lock 文案中性化" },
  { ids: [51, 52], title: "新会话与日志默认", kind: "host",
    why: "新会话保持 full access；官方 session log 默认不上传" },
  { ids: [56, 58, 75, 77], title: "回退不残留", kind: "host",
    why: "回退只藏被撤掉的那轮、标记不进模型请求、任务回收、append 即替换窗口" },
  { ids: [47, 49, 57, 69], title: "模型网关兼容", kind: "host",
    why: "OAuth 不插 Claude 身份、developer role 回退、stream 连接不被补丁打坏" },
  { ids: [87, 88, 90], title: "会话消息投递与挂载", kind: "host",
    why: "悬空注入块按 LF 锚点去重；恢复原生插话与队列顺序" },
  { ids: [82, 83, 84], optionalIds: [82, 83, 84], title: "桌面宿主启动兜底", kind: "host",
    why: "缺 DSH_PROFILE 也能定位 profile；host 被信号杀或正常退出不弹崩溃框" },
];

const ALL_IDS = new Set(core.ALL_PATCHES.map((p) => p.id));

export const BYPASS_LAYERS = Object.freeze(RAW_LAYERS.map((layer) => ({
  ...layer,
  ids: layer.ids.filter((id) => ALL_IDS.has(id)),
  optionalIds: (layer.optionalIds || []).filter((id) => ALL_IDS.has(id)),
})).filter((layer) => layer.ids.length > 0));

function patchById(id) {
  return core.ALL_PATCHES.find((p) => p.id === id);
}

/** 仅明确不适用/可选目标缺失可排除；必需文件缺失必须保留在分母里。 */
function notApplicable(patch, status) {
  if (!patch) return status === "na" || status === "skipped";
  if (status === "na" || status === "off" || status === "disabled" || status === "skipped") return true;
  if (status === "missing_file" && (patch.optional || patch.silentWhenMissing)) return true;
  if (status === "not_needed" && patch.id === 76) return true;
  return false;
}

export function tallyPatchStatus(status = {}, patches = core.ALL_PATCHES) {
  const result = { applied: 0, total: 0, all: patches.length, na: 0, skipped: 0, missing_file: 0, drifted: 0, partial: 0, pending: 0, unknown: 0, not_applicable: 0 };
  for (const patch of patches) {
    const value = status[patch.id];
    if (value === "na") result.na += 1;
    if (value === "skipped") result.skipped += 1;
    if (value === "missing_file") result.missing_file += 1;
    if (value === "drifted") result.drifted += 1;
    if (value === "partial") result.partial += 1;
    if (value === "pending") result.pending += 1;
    if (value === "unknown" || value === "unreadable") result.unknown += 1;
    if (notApplicable(patch, value)) result.not_applicable += 1;
    else {
      result.total += 1;
      if (value === "applied" || value === "already") result.applied += 1;
    }
  }
  return result;
}

export function rollupLayers(status = {}, hasHost = false, options = {}) {
  const statusFailed = Boolean(options.statusError);
  const patches = options.patches || core.ALL_PATCHES;
  const metadata = new Map(patches.map((p) => [p.id, p]));
  const layers = [];
  for (const layer of BYPASS_LAYERS) {
    const optionalIds = new Set(layer.optionalIds || []);
    const rows = layer.ids.map((id) => ({
      id,
      optional: metadata.has(id) ? Boolean(metadata.get(id).optional) : optionalIds.has(id),
      status: status[id] || (hasHost ? "unknown" : "unlocated"),
    }));
    const required = rows.filter((row) => !notApplicable(metadata.get(row.id), row.status));
    const applied = rows.filter((row) => row.status === "applied" || row.status === "already");
    const pending = required.filter((row) => row.status === "pending");
    const broken = required.filter((row) => !["applied", "already", "pending", "unlocated", "unknown", "skipped", "na", "off", "disabled", "not_needed"].includes(row.status));
    const absent = rows.filter((row) => notApplicable(metadata.get(row.id), row.status));
    const unknown = statusFailed || rows.some((row) => row.status === "unlocated" || row.status === "unknown");
    const state = broken.length ? "broken" : unknown ? "unknown" : pending.length ? "pending" : "ok";
    layers.push({
      title: layer.title,
      why: layer.why,
      kind: layer.kind,
      ids: layer.ids,
      ok: state === "ok",
      state,
      applied: applied.length,
      required: required.length,
      total: rows.length,
      pending: pending.map((row) => row.id),
      absent: absent.map((row) => row.id),
      broken: broken.map((row) => ({ id: row.id, status: row.status })),
      note: statusFailed
        ? `读取补丁状态失败，这一层没有被核对：${options.statusError}`
        : absent.length === rows.length ? "目标插件/预设未安装，这一层当前不适用" : "",
    });
  }
  return layers;
}

function hostVersion(aiBase) {
  for (const rel of ["dsh-agent-loop/package.json", "dsh/package.json", "dsh-system-prompt/package.json"]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(aiBase, rel), "utf8")).version || "unknown";
    } catch { /* try next */ }
  }
  return "unknown";
}

function runtimeLayer(dshHome) {
  const file = core.findOverrideFile(dshHome);
  let bytes = 0;
  try { bytes = fs.statSync(file).size; } catch { /* missing */ }
  return {
    title: "运行时提示词注入",
    why: "prompt-inject.md 作为 dsh-purge section 参与每一步 system prompt 组装",
    kind: "runtime",
    ids: [],
    ok: bytes > 0,
    state: bytes > 0 ? "ok" : "broken",
    applied: bytes > 0 ? 1 : 0,
    total: 1,
    pending: [],
    broken: bytes > 0 ? [] : [{ id: "inject", status: "empty" }],
    detail: { file, bytes },
    note: bytes > 0 ? `注入文件 ${bytes} 字节` : "注入文件为空：插件能加载，但没有内容可注入",
  };
}

function profileDirOf(dshHome) {
  const explicit = process.env.PURGE_PROFILE_DIR || (process.env.DSH_PROFILE ? path.join(dshHome, "profiles", process.env.DSH_PROFILE) : "");
  if (explicit && fs.existsSync(path.join(explicit, "package.json"))) return explicit;
  const root = path.join(dshHome, "profiles");
  let names = [];
  try { names = fs.readdirSync(root).filter((n) => fs.existsSync(path.join(root, n, "package.json"))); } catch { /* ignore */ }
  const preferred = detectSurface() === "desktop" ? ["desktop", "web"] : ["web", "desktop"];
  for (const name of preferred) if (names.includes(name)) return path.join(root, name);
  return names.length === 1 ? path.join(root, names[0]) : "";
}

function configLayer(dshHome) {
  const profile = profileDirOf(dshHome);
  const file = profile ? path.join(profile, "cordis.patch.yml") : "";
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { /* missing */ }
  let preset = "";
  try { preset = text.match(/defaultPreset:\s*["']?([a-z0-9-]+)/i)?.[1] || ""; } catch { /* ignore */ }
  const hasFull = /sandbox:\s*["']?danger-full-access/i.test(text);
  const hasNever = /approval:\s*["']?never/i.test(text);
  const known = hasFull && hasNever;
  const state = !profile ? "unknown" : known ? (preset ? "ok" : "inferred") : text.trim() ? "broken" : "unknown";
  return {
    title: "当前 profile 的权限选择",
    why: "界面层的最后一道门：即使补丁失效，这个组合也不会弹审批",
    kind: "config",
    ids: [],
    ok: state === "ok" || state === "inferred",
    state,
    applied: state === "ok" || state === "inferred" ? 1 : 0,
    total: 1,
    pending: [],
    broken: state === "broken" ? [{ id: "preset", status: preset || "unknown" }] : [],
    detail: { profile, file, preset, sandbox: hasFull ? "danger-full-access" : "?", approval: hasNever ? "never" : "?" },
    note: state === "broken" ? "已读到的 profile 权限不是完全访问 / never；若是有意设置，无需调整。" : state === "unknown" ? "未确认 profile 权限；未显式配置不等于未生效。" : "profile 权限为完全访问 / never。",
  };
}

function layoutLayer(state) {
  const surface = state.surface || detectSurface();
  if (surface === "web") {
    return { title: "宿主磁盘布局", kind: "layout", ids: [], ok: true, state: "na", applied: 0, total: 0, pending: [], broken: [], note: "不适用（Web 宿主）" };
  }
  const sealed = Boolean(state.asar_still_sealed);
  return {
    title: "宿主磁盘布局",
    kind: "layout",
    ids: [],
    ok: !sealed,
    state: sealed ? "broken" : "ok",
    applied: sealed ? 0 : 1,
    total: 1,
    pending: [],
    broken: sealed ? [{ id: "asar", status: "sealed" }] : [],
    note: sealed ? "目标磁盘仍有 app.asar；磁盘状态不代表当前进程已加载，需要重启时由用户操作" : "未发现密封归档。",
  };
}

/**
 * @param {string} aiBase 目标宿主 @deepseek-ai 根；空字符串表示未定位
 * @param {string} dshHome DSH 数据目录
 * @param {object} options {surface, dshHome, reader}
 */
export async function selfCheck(aiBase, dshHome = core.findDshHome(), options = {}) {
  const state = options.state || await core.gatherState();
  const host = aiBase || state.ai_base || "";
  const surface = options.surface || state.surface || detectSurface();
  let status = {};
  let statusError = "";
  if (host) {
    try {
      const detail = await core.patchStatusDetail(host, core.ALL_PATCHES, { surface, dshHome });
      status = detail.status;
    } catch (error) {
      status = {};
      statusError = String(error && error.message ? error.message : error);
    }
  }
  const layers = rollupLayers(status, Boolean(host), { statusError, patches: core.ALL_PATCHES });
  const grouped = new Set(BYPASS_LAYERS.flatMap((layer) => layer.ids));
  const missing = core.ALL_PATCHES.filter((p) => !grouped.has(p.id) && !p.optional && status[p.id] === "missing_file");
  if (missing.length) {
    layers.push({
      title: "其他必需目标文件",
      kind: "host",
      why: "安装缺少必需目标文件，需要核对目标路径或安装完整性",
      ids: missing.map((p) => p.id),
      ok: false,
      state: "broken",
      applied: 0,
      total: missing.length,
      pending: [],
      broken: missing.map((p) => ({ id: p.id, status: "missing_file" })),
    });
  }
  layers.push(runtimeLayer(dshHome));
  layers.push(configLayer(dshHome));
  layers.push(layoutLayer({ ...state, surface }));

  const applicable = layers.filter((layer) => layer.state !== "na");
  const brokenLayers = applicable.filter((layer) => layer.state === "broken");
  const pendingLayers = applicable.filter((layer) => layer.state === "pending");
  const unknownLayers = applicable.filter((layer) => layer.state === "unknown");
  const inferredLayers = applicable.filter((layer) => layer.state === "inferred");
  const ok = applicable.every((layer) => layer.ok);
  return {
    ok,
    state: !host || statusError ? "broken" : brokenLayers.length ? "broken" : pendingLayers.length ? "pending" : unknownLayers.length ? "unknown" : inferredLayers.length ? "inferred" : "ok",
    host,
    host_version: host ? hostVersion(host) : "unknown",
    surface,
    patch: tallyPatchStatus(status, core.ALL_PATCHES),
    summary: {
      host: { passed: applicable.filter((l) => l.kind === "host" && l.ok).length, total: applicable.filter((l) => l.kind === "host").length },
      runtime: { passed: applicable.filter((l) => l.kind === "runtime" && l.ok).length, total: applicable.filter((l) => l.kind === "runtime").length },
      config: { passed: applicable.filter((l) => l.kind === "config" && l.ok).length, total: applicable.filter((l) => l.kind === "config").length },
      layout: { passed: applicable.filter((l) => l.kind === "layout" && l.ok).length, total: applicable.filter((l) => l.kind === "layout").length },
      pending: { layers: pendingLayers.length, patches: pendingLayers.reduce((n, l) => n + l.pending.length, 0) },
      uncertain: { layers: unknownLayers.length + inferredLayers.length },
      broken: { layers: brokenLayers.length },
    },
    layers,
    hints: applicable.filter((layer) => !layer.ok).map((layer) => ({
      title: layer.title,
      action: layer.kind === "runtime"
        ? "写入 prompt-inject.md 或在插件设置里保存一次提示词"
        : layer.kind === "config"
          ? (layer.detail?.profile ? "检查当前 profile 的 permission-presets，或让用户确认是否接受推导值" : "未定位 profile；设置 DSH_PROFILE 后重试")
          : layer.kind === "layout"
            ? "运行 host-status 核对当前服务入口；磁盘状态不代表已加载"
            : layer.state === "unknown"
              ? "未定位当前宿主；明确 DSH_BASE 或 PURGE_DSH_CLI 后重试"
              : `运行 dsh-purge --diagnose 查看 #${layer.ids.join("/#")} 的锚点`,
    })),
  };
}

export const BYPASS_LAYER_COUNT = BYPASS_LAYERS.length;
