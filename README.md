<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge-plus" width="720">
</p>

<h1 align="center">⚔️ dsh-purge-plus</h1>

<p align="center"><strong>DeepSeek Harness jailbreak, prompt/tool switches and red-team evaluation plugin</strong></p>

<p align="center">
  <a href="https://github.com/weimin96/dsh-purge-plus">GitHub</a> ·
  <a href="https://github.com/weimin96/dsh-purge-plus/releases">Releases</a> ·
  <a href="CHANGELOG.md">CHANGELOG</a> ·
  <a href="docs/feature-switches.md">Feature switches</a>
</p>

> Based on [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) by 小杨 (MIT). Original attribution, licence and non-commercial terms are retained; see [NOTICE.md](NOTICE.md) and [DISCLAIMER.md](DISCLAIMER.md).

---

## What this is

`dsh-purge-plus` is a local DeepSeek Harness plugin that brings jailbreak, prompt injection, tool switches, red-team drills and day-to-day maintenance into one place: **Settings → Purge**.

It addresses three areas:

1. **Host behaviour**: 79 source patches for sandbox, approvals, filesystem fences, tool-result pruning, prompt assembly and related host behaviour.
2. **Model behaviour**: prompt injection, capability protocol, auto-retry / auto-continue and other runtime features that shape context and turn flow.
3. **Observability and recovery**: self-check, anchor drift diagnostics, runtime probe, maintenance snapshots, pre-update snapshots and feature switches.

> Host patches require **Apply** and a host restart. Runtime feature switches do not modify host source and can be changed at any time.

## Layers

| Layer | What it covers | Entry point |
| --- | --- | --- |
| Host source patches | 79 patches: sandbox, approvals, filesystem, tool descriptions, prompt assembly, identity | Settings → Purge → Apply / Revert |
| Prompt injection | Main prompt, capability protocol, probe, rule sets, `excludePresets` | Settings → Purge → Prompt / Feature switches |
| Agent loop | Auto retry, auto continue, refusal retry | Settings → Purge → Feature switches |
| Tools and red team | `purge_*` controls, 64 `redteam_*` tools, drill console, asset store | Settings → Purge → Drill |
| Maintenance | Self-check, diagnostics, probe, snapshots, rollback, update preferences | Settings → Purge top actions / CLI |

## Requirements

- DSH **0.2.1-rc.2** is the primary target; DSH 0.2.2-rc.1 anchors still need per-patch verification (`--selfcheck` reports drift honestly).
- Node.js **≥18**; red-team tools need Node **≥22.5** (`node:sqlite`).
- Official `dsh web` and the official desktop EXE install separately and each needs its own Apply.

## Install

### Local checkout

```sh
dsh plugin --profile web add .
```

Desktop: use the desktop app's plugin installation UI with this directory or the release package; the `desktop` profile is managed exclusively by the Electron host, so the CLI rejects direct management.

### From GitHub

```sh
dsh plugin --profile web add https://github.com/weimin96/dsh-purge-plus/archive/refs/heads/main.tar.gz
```

After installation:

1. Fully quit and reopen DSH.
2. Open **Settings → Purge**.
3. Click **Apply**.
4. A successful Apply restarts the host; start a new chat afterwards.

## Commands

Run from the project checkout (`node bin/dsh-purge-plus.js ...`) or use the globally linked `dsh-purge-plus` command.

```sh
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

/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <zip-or-folder> | create <id> [description] | delete <id> | help
```

## Feature switches

The **Feature switches** card in Settings → Purge has quick modes and per-feature controls:

| Switch | Default | Effect |
| --- | --- | --- |
| `master` | on | Runtime master switch; host patches remain governed by Apply |
| `promptInject` | on | Main prompt injection; turn off when context pressure hurts model quality |
| `capabilityProtocol` | on | Capability/skill guidance section |
| `autoRetry` | on | Automatic retry on request errors |
| `autoContinue` | off | Automatic continuation after empty/interrupted turns |
| `refusalRetry` | off | One retry when the model refuses |
| `redteamTools` | on | 64 red-team tools; turn off for normal coding tasks; restart after changing |
| Host patches | — | Card below runtime features: applied / total, pending / skipped, with Apply, Revert and Restart buttons |

Quick modes:

- **All on**: enable all runtime features.
- **Light mode**: keep host patches, main prompt injection and automatic request retry; disable capability protocol, auto-continue, refusal retry and red-team tools.
- **All off (runtime)**: all runtime features off; host patches are reverted separately.

Settings live in `$DSH_HOME/dsh-purge/features.json`; API: `GET/POST /dsh-purge/features`. See [docs/feature-switches.md](docs/feature-switches.md).

## Self-check and maintenance

```sh
dsh-purge-plus --selfcheck   # 25 layers: ok / pending / inferred / unknown / broken
dsh-purge-plus --diagnose    # anchor drift: file, line and candidate
dsh-purge-plus --probe       # 30-minute echo probe
dsh-purge-plus --backup      # plugin/profile snapshot
dsh-purge-plus --rollback ID # restore plugin files
```

Snapshots live under `$DSH_HOME/dsh-purge/backups/`. Updates take a snapshot first and stop if the snapshot fails.

## Layout

```text
bin/            CLI entry
lib/            patch engine, prompt injection, tools, self-check, maintenance, updates
lib/redteam/    red-team tools, asset store, evidence ledger
presets/        redteam and unrestricted presets
skills/         bundled skills
client.js       settings-page client bundle
cordis.patch.yml  bundle configuration
docs/           feature-switch and comparison docs
test/           unit and regression tests
```

## Development

```sh
npm test
npm run build:client
node --check lib/index.js
```

`npm test` currently covers 19 node:test cases, 71 gate checks and 21 cwd checks.

## Restore and update

- Updates create a snapshot first; use the returned `backup_id` to roll back.
- `--revert` restores host patches while keeping `prompt-inject.md`.
- `--rollback` restores plugin files without restarting the host.

## Attribution and licence

- Original project: [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge), author 小杨, MIT License.
- This branch: `weimin96/dsh-purge-plus`, retaining original attribution, licence and non-commercial terms.
- Read [NOTICE.md](NOTICE.md) and [DISCLAIMER.md](DISCLAIMER.md) before redistribution.
