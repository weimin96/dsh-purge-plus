/**
 * 轻量维护快照。
 *
 * 目标不是替代包管理器，而是给“插件更新/手动改文件”留一条可恢复路径：
 * - 快照当前插件目录（lib/bin/client.js/cordis.patch.yml/package.json…）；
 * - 快照当前 profile 的 package.json / pnpm-lock.yaml / cordis.patch.yml（只作证据，不自动覆盖）；
 * - 列表、占用统计、prune、rollback（恢复插件文件，不重启宿主）。
 *
 * 设计参考 dsh-purge Community 的 Maintenance（MIT），按本仓库的目录结构精简。
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { atomicWriteSync, findDshHome } from "./core.js";
import { acquireMaintenanceLock } from "./maintenance-lock.js";
import { assertWithinRoots } from "./path-boundary.js";

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKUP_SCHEMA = 1;
export const COPY_NAMES = [
  "lib", "bin", "presets", "skills", "docs", "scripts",
  "client.js", "cordis.patch.yml", "package.json",
  "README.md", "README.zh-CN.md", "LICENSE", "NOTICE.md",
  "DISCLAIMER.md", "CHANGELOG.md", "release-notes.md", "screenshots.json",
];
const EXCLUDE_NAMES = new Set([".git", "node_modules", ".DS_Store", ".dshpurge.bak"]);

function backupsRoot(home = findDshHome()) {
  return path.join(home, "dsh-purge", "backups");
}

function validId(id) {
  return typeof id === "string" && /^[0-9A-Za-z._-]{8,80}$/.test(id);
}

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(4).toString("hex");
}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walkFiles(root, prefix = "", out = []) {
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (EXCLUDE_NAMES.has(entry.name)) continue;
    const rel = prefix ? path.join(prefix, entry.name) : entry.name;
    const full = path.join(root, entry.name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walkFiles(full, rel, out);
    else if (stat.isFile()) out.push({ rel: rel.split(path.sep).join("/"), file: full, bytes: stat.size });
  }
  return out;
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const name of COPY_NAMES) {
    const from = path.join(src, name);
    if (!fs.existsSync(from)) continue;
    const to = path.join(dest, name);
    fs.cpSync(from, to, {
      recursive: true,
      force: true,
      filter: (source) => !EXCLUDE_NAMES.has(path.basename(source)),
    });
  }
}

function profileDirOf(home, explicit = "") {
  if (explicit) return path.resolve(explicit);
  const root = path.join(home, "profiles");
  let names = [];
  try { names = fs.readdirSync(root).filter((n) => fs.existsSync(path.join(root, n, "package.json"))); } catch { /* ignore */ }
  const preferred = process.env.DSH_PROFILE ? [process.env.DSH_PROFILE] : ["web", "desktop"];
  for (const name of preferred) if (names.includes(name)) return path.join(root, name);
  return names.length === 1 ? path.join(root, names[0]) : "";
}

function readManifest(folder) {
  try { return JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8")); } catch { return null; }
}

export function listBackups(home = findDshHome()) {
  const root = backupsRoot(home);
  let names = [];
  try { names = fs.readdirSync(root).filter((name) => validId(name)); } catch { return []; }
  return names.flatMap((id) => {
    const folder = path.join(root, id);
    const manifest = readManifest(folder);
    if (!manifest || manifest.schema !== BACKUP_SCHEMA || !manifest.complete) return [];
    return [{
      id,
      folder,
      reason: manifest.reason || "",
      created_at: manifest.created_at || "",
      bytes: Number(manifest.bytes) || 0,
      files: Number(manifest.files) || 0,
      profile: manifest.profile || "",
    }];
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export function usage(home = findDshHome()) {
  const list = listBackups(home);
  return { count: list.length, bytes: list.reduce((sum, item) => sum + item.bytes, 0), backups: list };
}

export function snapshot({ home = findDshHome(), reason = "manual", profileDir = "", root = PLUGIN_ROOT } = {}) {
  if (!home) throw new Error("未定位 DSH 数据目录，无法快照");
  const base = backupsRoot(home);
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const lock = acquireMaintenanceLock(base);
  try {
    const id = nowId();
    const folder = path.join(base, id);
    assertWithinRoots(folder, [base]);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const pluginDir = path.join(folder, "plugin");
    copyTree(root, pluginDir);
    const files = walkFiles(pluginDir);
    const profile = profileDirOf(home, profileDir);
    const profileFiles = [];
    if (profile && fs.existsSync(profile)) {
      const profileBackup = path.join(folder, "profile");
      fs.mkdirSync(profileBackup, { recursive: true, mode: 0o700 });
      for (const name of ["package.json", "pnpm-lock.yaml", "cordis.patch.yml"]) {
        const from = path.join(profile, name);
        if (!fs.existsSync(from)) continue;
        fs.cpSync(from, path.join(profileBackup, name), { force: true });
        profileFiles.push(name);
      }
    }
    const manifest = {
      schema: BACKUP_SCHEMA,
      id,
      complete: true,
      reason,
      created_at: new Date().toISOString(),
      plugin_root: root,
      profile,
      profile_files: profileFiles,
      files: files.length,
      bytes: files.reduce((sum, item) => sum + item.bytes, 0),
      blobs: Object.fromEntries(files.map((item) => [item.rel, sha256File(item.file)])),
    };
    atomicWriteSync(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8", { mode: 0o600 });
    return { ok: true, id, folder, files: manifest.files, bytes: manifest.bytes, profile: manifest.profile };
  } finally {
    lock.release();
  }
}

export function verify(id, home = findDshHome()) {
  if (!validId(id)) throw new Error("备份 ID 无效");
  const folder = path.join(backupsRoot(home), id);
  assertWithinRoots(folder, [backupsRoot(home)]);
  const manifest = readManifest(folder);
  if (!manifest || manifest.schema !== BACKUP_SCHEMA || !manifest.complete) throw new Error("备份不完整或 manifest 无法读取");
  const pluginDir = path.join(folder, "plugin");
  assertWithinRoots(pluginDir, [folder]);
  const files = walkFiles(pluginDir);
  for (const item of files) {
    const expected = manifest.blobs && manifest.blobs[item.rel];
    if (!expected) throw new Error(`备份 manifest 缺少文件：${item.rel}`);
    if (sha256File(item.file) !== expected) throw new Error(`备份文件校验失败：${item.rel}`);
  }
  return { folder, pluginDir, manifest };
}

export function rollback(id, { home = findDshHome(), profileDir = "", root = PLUGIN_ROOT } = {}) {
  if (!home) throw new Error("未定位 DSH 数据目录，无法回滚");
  const { pluginDir, manifest } = verify(id, home);
  // 回滚前先给当前状态留一份快照，避免回滚本身成为不可逆操作。
  // snapshot() 自己会取维护锁，必须在 rollback 的锁之外执行，否则同进程重入会 BUSY。
  const safety = snapshot({ home, reason: "before-rollback", profileDir, root });
  const lock = acquireMaintenanceLock(backupsRoot(home));
  try {
    for (const name of COPY_NAMES) {
      const target = path.join(root, name);
      const source = path.join(pluginDir, name);
      if (fs.existsSync(target)) {
        const stat = fs.lstatSync(target);
        if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
        else fs.unlinkSync(target);
      }
      if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, force: true });
    }
    return { ok: true, id, restored: manifest.files, safety: safety.id, note: "插件文件已恢复；重启宿主后生效" };
  } finally {
    lock.release();
  }
}

export function prune({ home = findDshHome(), keepLast = 5, keepDays = 7, maxTotalBytes = 200 * 1024 * 1024, protect = "" } = {}) {
  if (!home) throw new Error("未定位 DSH 数据目录，无法清理");
  const base = backupsRoot(home);
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const lock = acquireMaintenanceLock(base);
  try {
    const list = listBackups(home);
    const keep = new Set(list.slice(0, Math.max(1, keepLast)).map((item) => item.id));
    if (protect) keep.add(protect);
    const cutoff = Date.now() - Math.max(1, keepDays) * 24 * 60 * 60 * 1000;
    const removed = [];
    let total = 0;
    for (const item of list) {
      const age = Date.parse(item.created_at) || 0;
      const shouldKeep = keep.has(item.id) || (keepDays > 0 && age >= cutoff);
      if (shouldKeep) { total += item.bytes; continue; }
      fs.rmSync(item.folder, { recursive: true, force: true });
      removed.push(item.id);
    }
    for (const item of listBackups(home).slice().reverse()) {
      if (total <= maxTotalBytes) break;
      if (item.id === protect || item.id === list[0]?.id) continue;
      total -= item.bytes;
      fs.rmSync(item.folder, { recursive: true, force: true });
      removed.push(item.id);
    }
    return { ok: true, removed, usage: usage(home) };
  } finally {
    lock.release();
  }
}

export function backupBeforeUpdate({ home = findDshHome(), root = PLUGIN_ROOT } = {}) {
  try {
    const saved = snapshot({ home, reason: "before-update", root });
    try { prune({ home, keepLast: 5 }); } catch { /* 清理失败不影响本次更新 */ }
    return saved;
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}
