# Decisions

Running log of product and engineering decisions made while building Shard Launcher. Newest at the bottom of each section. When a choice was not dictated by the brief, the rule was: do what Lunar Client's launcher or the Modrinth App would do.

## Project layout and tooling

- **Project lives next to the user's other projects** (`New folder/shard-launcher`), not in the session scratch workspace, because the scratch workspace is deleted with the session.
- **ESM main process, CommonJS preload.** electron-store 11 is ESM-only, so `package.json` has `"type": "module"` and the main bundle is ESM. Sandboxed preload scripts must be CommonJS, so the preload build is forced to `format: 'cjs'` with a `.cjs` extension and has `externalizeDeps: false` so Zod is bundled into it (a sandboxed preload cannot `require` from `node_modules`).
- **Vite 7, not 8.** electron-vite 5.0 declares `vite ^5 || ^6 || ^7`. `@vitejs/plugin-react@4` is the matching React plugin (v6 requires Vite 8).
- **TypeScript 5.9.** TypeScript 7 (the native port) was the latest on npm, but typescript-eslint 8.71 supports `<6.1` and the toolchain is best tested on 5.x.
- **React 18**, as the brief asked, even though React 19 is current.
- **Zod 4** API throughout (`z.record(key, value)`, `error.issues`).
- **Tailwind CSS 4** via `@tailwindcss/vite`, with design tokens defined as CSS custom properties on `:root` and mapped through `@theme inline` so the accent colour can change at runtime from Settings.
- **three.js is not a direct dependency.** `skinview3d` pins its own `three`; adding a second copy would double the bundle and risk instanceof mismatches.
- **No `discord-rpc` package.** Rich Presence is a ~120 line IPC client over the Discord named pipe / Unix socket, avoiding an unmaintained dependency.
- **Renderer-only libraries are devDependencies.** electron-builder packs only `dependencies` into the asar; everything Vite bundles into the renderer does not need to ship as node_modules.
- **Bash tool command length.** Large source files are written with the Write tool; heredocs longer than roughly 8 KB were being truncated.

## Data and files

- **Config directory vs data directory.** `settings.json`, `accounts.json` and logs always live in the platform default folder (`%APPDATA%/Shard`, `~/Library/Application Support/Shard`, `~/.local/share/Shard`). Only the heavy, movable folders (`instances/`, `libraries/`, `assets/`, `versions/`, `java/`, `cache/`, `skins/`, `shared-config/`, `cosmetics/`) move when the user changes the data directory. This way the launcher can always find its settings on start.
- **Chromium profile is redirected** to `<config>/electron-data` so cookies from the Microsoft sign-in window and the HTTP cache stay inside the Shard folder instead of `%APPDATA%/shard-launcher`.
- **Linux data root follows XDG_DATA_HOME** (`~/.local/share/Shard`) rather than Electron's default `~/.config`, as the brief specified.
- **Atomic writes everywhere.** JSON files are written to a temp file and renamed so a crash never leaves a half-written instance or settings file.
- **Remote JSON cache** (`cache/*.json`) stores an envelope with ETag and fetch time. Offline mode serves the last good copy; a payload that fails Zod validation is never cached.

## Versions

- **Release filter is semantic, snapshot filter is temporal.** Releases must parse as `major.minor[.patch]` and compare `>= 1.21`. Snapshots have no semantic version, so they are included (only when the toggle is on) when their `releaseTime` is newer than the 1.21 release's.
- **Three states are computed from installation and client availability.** `not-installed` when no instance exists for the version; otherwise `ready` if the Shard client manifest has a build for it, else `client-pending`. `clientAvailable` is exposed separately so uninstalled versions can still show whether the client is ready.
- **Java version comes from the version JSON.** `javaVersion.majorVersion` decides which runtime to install (21 for 1.21.x). The fallback for malformed metadata is 21 because nothing older than 1.21 exists in the launcher.

## Mods

- **Bundled set is data, not code.** `src/main/mods/bundled-mods.json` lists Modrinth slugs plus each mod's config files for the shared config layer, a list of extra shared files (`options.txt`, `servers.dat`), and a conflict list. A hosted copy at the Shard meta repo overrides it so the set can change without a launcher release.
- **Waiting, not failing.** A bundled mod with no file for a brand-new Minecraft version is shown as "Waiting for update" and skipped; the launcher re-checks on every launch.
- **Shared config layer is a two-way sync, not symlinks.** Windows symlinks need Developer Mode or admin rights, and per-file junctions do not exist. Before launch the launcher copies newer shared files into the instance; after exit it copies changed files back. Per-instance override simply turns the sync off for that instance.
- **Modrinth User-Agent** is `shard-client/shard-launcher/<version> (<contact>)`. The contact defaults to the GitHub repository URL and is overridable with `MODRINTH_CONTACT`; no personal email is baked into the source.

## Auth

- **Loopback redirect URI** `http://localhost/shard-auth`. The sign-in BrowserWindow intercepts navigation to the redirect before it happens and reads `code` from the URL, so no local HTTP server is needed. Azure's loopback exemption matches any port for public clients.
- **Device-code fallback** uses the same client id and requires "Allow public client flows" on the app registration (documented in the README).
- **Secrets are stored with Electron safeStorage**, one encrypted blob per account inside `accounts.json`; the renderer only ever sees `AccountSummary` objects. Log output is scrubbed of tokens by an electron-log hook.
- **No offline/cracked mode.** Installed instances can still be launched offline using the last known session of a previously verified account, which matches the brief's offline requirement without bypassing ownership.

## UI

- **Dark theme is the only polished theme.** Light tokens exist and switch cleanly, but the design target is dark glass.
- **Keyboard shortcuts** `Ctrl/Cmd+1..7` switch pages; every interactive control gets a visible focus ring.
- **Errors carry stable codes** (`ShardError.code`) across IPC so the renderer can show tailored copy and actions (buy the game, create a profile, manage family) instead of raw messages.

## Findings from the end-to-end smoke runs

- **Automatic updates never cross channels.** Modrinth's `/version_files/update` returns the newest matching version regardless of channel. During verification it moved Sodium from 0.9.2 (release) to 0.9.3-alpha.1, which broke Reese's Sodium Options' exact-version dependency and Fabric refused to start. `src/main/mods/update-policy.ts` now only accepts release-channel updates for release installs (prerelease installs may follow prereleases); when the endpoint offers a prerelease, Shard Core falls back to the newest release-channel build via the project's version list.
- **Fatal startup errors are crashes.** Fabric Loader shows a Swing dialog on dependency failures and keeps the process alive, so the launcher reported "running" forever. The console now recognises fatal startup patterns (`Incompatible mods found!`, `FormattedException`, `UnsupportedClassVersionError`, out-of-memory, …), captures Fabric's suggested fixes, terminates the process and reports the run as crashed with that summary.
- **AppData virtualization breaks Fabric's class-loader isolation.** When the launcher runs inside an MSIX-packaged host (here: the Claude desktop app), `%APPDATA%` writes are redirected to `AppData\Local\Packages\<app>\LocalCache\Roaming`. The JVM then reports jar code sources under the redirected path while the classpath strings use the Roaming path; Knot treats loader/Mixin classes as foreign, loads duplicates, and every mixin plugin fails with `ClassCastException`. Vanilla is unaffected. A normal installation is not virtualized, and `SHARD_DATA_DIR` (portable mode) sidesteps it entirely; the Shard smoke run passes with data outside AppData.
- **Minecraft 26.x is unobfuscated.** Fabric meta's profile JSON no longer ships `net.fabricmc:intermediary` for these versions and the loader logs `Mappings not present!`; this is expected and harmless.

## Verification hooks

- **Smoke screenshot.** Setting `SHARD_SMOKE_SCREENSHOT=<path>` makes the main process capture the window after load and quit. Used to verify the UI without a display server or screen access.
- **End-to-end smoke harness (development builds only).** `SHARD_SMOKE_INSTALL=<version|latest>` creates an instance and runs the whole prepare pipeline against the real Mojang/Fabric/Modrinth endpoints; `SHARD_SMOKE_LAUNCH=1` then launches the game with a placeholder session and waits for the title screen (LWJGL backend + sound engine + texture atlas log lines) before killing it; `SHARD_SMOKE_RESULT=<path>` writes a JSON summary. The placeholder session exists only in `src/main/smoke.ts`, is unreachable when `app.isPackaged`, and is not an offline mode: it is how the phase-3 requirement ("a vanilla 1.21.x instance must launch and reach the title screen") is verified without a Microsoft account on the build machine.
