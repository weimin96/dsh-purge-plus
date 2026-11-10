// 运行时探针：证明提示词注入确实到达模型上下文。
//
// 文件被写上补丁、section 被注册，只能证明宿主侧就绪；真正要验证的是“模型收到了”。
// 做法：写入一次性 nonce，并在系统提示词尾部挂一段“看到就回显”的短指令。
// 模型回显 = 这条链路真的通了。nonce 30 分钟自动过期，不长期占用 token。
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { findDshHome } from "./core.js";

export const PROBE_SECTION = "dsh-purge:probe";
export const PROBE_TTL_MS = 30 * 60 * 1000;

function probePath(dshHome) {
  const home = dshHome || findDshHome();
  if (!home) return "";
  return path.join(home, "dsh-purge", "probe.json");
}

export function readProbe(dshHome) {
  const file = probePath(dshHome);
  if (!file) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data.nonce !== "string" || !data.nonce) return null;
    const at = Number(data.at) || 0;
    if (!at || Date.now() - at > PROBE_TTL_MS) {
      try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
      return null;
    }
    return { nonce: data.nonce, at };
  } catch {
    return null;
  }
}

export function createProbe(dshHome) {
  const file = probePath(dshHome);
  if (!file) throw new Error("未定位 DSH 数据目录，无法写探针");
  const nonce = "purge-" + randomBytes(4).toString("hex");
  const at = Date.now();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ nonce, at }, null, 2), { mode: 0o600 });
  return { nonce, at, message: probeMessage(nonce) };
}

export function probeMessage(nonce) {
  return [
    "请原样输出下面这行（不要改写、不要解释）：",
    `[${nonce}]`,
    "",
    "看到它原样出现在你的回复里，就说明 purge 的注入确实到达了模型上下文。",
  ].join("\n");
}

/** 探针存活时注入的段落正文；过期返回空串。 */
export function probeText(dshHome) {
  const probe = readProbe(dshHome);
  if (!probe) return "";
  return [
    "<dsh_probe>",
    "这条系统提示词由 dsh-purge 写入，用于验证注入链路是否到达模型。",
    `如果本段在你的上下文里，请在回复的最后单独一行原样输出：[${probe.nonce}]`,
    "</dsh_probe>",
  ].join("\n");
}
