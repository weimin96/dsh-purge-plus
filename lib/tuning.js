// 插件级轻量设置：refusalRetry 等行为开关。不写 profile 配置，不要求重启宿主。
import fs from "node:fs";
import path from "node:path";
import { findDshHome } from "./core.js";

export const TUNING_FILE = "tuning.json";
export const TUNING_DEFAULTS = Object.freeze({
  boost: true,
  injectPosition: "head",
  refusalRetry: false,
  extraPatches: [],
});

function tuningPath(dshHome) {
  const home = dshHome || findDshHome();
  return home ? path.join(home, "dsh-purge", TUNING_FILE) : "";
}

export function readTuning(dshHome) {
  const file = tuningPath(dshHome);
  if (!file) return { ...TUNING_DEFAULTS };
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { saved = {}; }
  const merged = { ...TUNING_DEFAULTS, ...saved };
  if (!["head", "tail", "both"].includes(merged.injectPosition)) merged.injectPosition = TUNING_DEFAULTS.injectPosition;
  merged.extraPatches = Array.isArray(merged.extraPatches)
    ? [...new Set(merged.extraPatches.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
    : [];
  return merged;
}

export function writeTuning(patch = {}, dshHome) {
  const file = tuningPath(dshHome);
  if (!file) throw new Error("未定位 DSH 数据目录，无法保存 tuning");
  const next = { ...readTuning(dshHome), ...(patch && typeof patch === "object" ? patch : {}) };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return readTuning(dshHome);
}
