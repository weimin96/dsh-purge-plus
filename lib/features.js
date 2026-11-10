/**
 * 运行时功能开关。
 *
 * 目的：把“会影响模型行为/智能表现”的运行时功能做成可随时切换的开关，
 * 不改 profile、不重启宿主：
 *   - master: 运行时功能总开关（宿主源码补丁仍按“应用”状态生效）
 *   - promptInject: 主提示词注入
 *   - capabilityProtocol: 能力协议段
 *   - autoRetry: 请求异常自动重试
 *   - autoContinue: 空回答/中断后的自动续跑
 *   - refusalRetry: 模型推脱时的单次重试
 *   - redteamTools: 红队工具注册（下次宿主加载时生效）
 *
 * 文件：$DSH_HOME/dsh-purge/features.json
 */
import fs from "node:fs";
import path from "node:path";
import { atomicWriteSync, findDshHome } from "./core.js";

export const FEATURES_FILE = "features.json";
export const FEATURE_DEFAULTS = Object.freeze({
  master: true,
  promptInject: true,
  capabilityProtocol: true,
  autoRetry: true,
  autoContinue: false,
  refusalRetry: false,
  redteamTools: true,
});

const FEATURE_KEYS = new Set(Object.keys(FEATURE_DEFAULTS));

function featuresPath(dshHome) {
  const home = dshHome || findDshHome();
  return home ? path.join(home, "dsh-purge", FEATURES_FILE) : "";
}

let cache = { home: "", at: 0, value: { ...FEATURE_DEFAULTS } };

function normalize(value = {}) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of FEATURE_KEYS) out[key] = typeof src[key] === "boolean" ? src[key] : FEATURE_DEFAULTS[key];
  return out;
}

export function readFeatures(dshHome) {
  const home = dshHome || findDshHome();
  const now = Date.now();
  if (cache.home === home && now - cache.at < 500) return { ...cache.value };
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(featuresPath(home), "utf8")) || {}; } catch { saved = {}; }
  const value = normalize({ ...FEATURE_DEFAULTS, ...saved });
  cache = { home, at: now, value };
  return { ...value };
}

export function writeFeatures(patch = {}, dshHome) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("功能开关必须是对象");
  const unknown = Object.keys(patch).filter((key) => !FEATURE_KEYS.has(key));
  if (unknown.length) throw new Error(`未知功能开关：${unknown.join(", ")}`);
  const next = normalize({ ...readFeatures(dshHome), ...patch });
  const file = featuresPath(dshHome);
  if (!file) throw new Error("未定位 DSH 数据目录，无法保存功能开关");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  atomicWriteSync(file, `${JSON.stringify(next, null, 2)}\n`);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  cache = { home: dshHome || findDshHome(), at: Date.now(), value: next };
  return { ...next };
}

export function applyFeaturePreset(mode, dshHome) {
  const value = String(mode || "").toLowerCase();
  if (value === "all") {
    return writeFeatures({
      master: true,
      promptInject: true,
      capabilityProtocol: true,
      autoRetry: true,
      autoContinue: true,
      refusalRetry: true,
      redteamTools: true,
    }, dshHome);
  }
  if (value === "smart") {
    // 轻量模式：保留核心提示词注入与请求异常重试，关掉容易稀释上下文/干扰工具选择的附加功能。
    return writeFeatures({
      master: true,
      promptInject: true,
      capabilityProtocol: false,
      autoRetry: true,
      autoContinue: false,
      refusalRetry: false,
      redteamTools: false,
    }, dshHome);
  }
  if (value === "none") {
    return writeFeatures({
      master: false,
      promptInject: false,
      capabilityProtocol: false,
      autoRetry: false,
      autoContinue: false,
      refusalRetry: false,
      redteamTools: false,
    }, dshHome);
  }
  throw new Error("未知功能预设：all / smart / none");
}

/** 把总开关应用到各运行时功能后的“实际生效值”。 */
export function effectiveFeatures(value = readFeatures()) {
  const flags = normalize(value);
  const master = flags.master === true;
  return {
    master,
    promptInject: master && flags.promptInject,
    capabilityProtocol: master && flags.capabilityProtocol,
    autoRetry: master && flags.autoRetry,
    autoContinue: master && flags.autoContinue,
    refusalRetry: master && flags.refusalRetry,
    redteamTools: master && flags.redteamTools,
  };
}
