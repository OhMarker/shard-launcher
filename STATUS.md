# Status (handoff for a new session)

Last updated 2026-10-07.

## Shard Launcher (this repo)
- Complete and verified: 264 unit tests, lint and typecheck clean, headless renders of every page,
  real end-to-end runs (vanilla and Shard instances downloaded from Mojang/Fabric/Modrinth and reached
  the Minecraft title screen). Details in DECISIONS.md.
- Published at https://github.com/OhMarker/shard-launcher (public). CI on `main` is green; the
  Linux smoke job used to fail intermittently (capturePage UnknownVizError under xvfb) and was fixed
  by disabling hardware acceleration for smoke renders and retrying the capture.
- Windows builds exist in `dist/`: `ShardLauncher-0.1.0-portable.exe` (single file; builds made after
  2026-10-07 name it `ShardLauncher-portable.exe` with no version) and
  `shard-launcher-setup-0.1.0-x64.exe` / `-arm64.exe` installers.
- `docs/` is the download page (GitHub Pages from `main` / `docs`). The Download button is a
  direct file download: it points at the permanent link
  `https://github.com/OhMarker/shard-launcher/releases/latest/download/ShardLauncher-portable.exe`,
  which GitHub resolves to the newest release's file with no page in between. JavaScript only adds
  the version, size, installer and macOS/Linux links. `docs/download/` is a shareable short link
  that starts the same download immediately. GitHub Pages cannot hold the exe itself (100 MB file
  limit; the launcher is ~114 MB because Electron is), so the file is stored as a release asset.
- `.env` holds `MSA_CLIENT_ID=335a9f92-08ac-4f4a-9f9c-d0a00d4fb4dc` (Azure app "Shard Launcher",
  tenant bdc55f7d-dddc-4492-99f8-65509b6005fd, personal accounts, redirect http://localhost/shard-auth,
  public client flows on). The id is compiled into the builds above.
- Sign-in currently fails at the last step with "Invalid app registration": Mojang has not yet
  approved the client id. The owner submitted the approval form (https://aka.ms/mce-reviewappid)
  on 2026-10-06. No approval email had arrived in the owner's Gmail as of 2026-10-07. Nothing to
  change; it starts working when Mojang's email arrives.
- The hosted `meta` repository is prepared in ../meta (committed locally, not on GitHub yet); the
  launcher falls back correctly until it exists (Client pending, shipped mod set, bundled cosmetics).

## Shard Client (../shard-client)
- First release built and verified in-game for Minecraft 1.21.11; committed locally, not pushed
  (see ../shard-client/STATUS.md).

## Owner-only steps (Claude's sandbox was refused these; run in this order)
1. Publish the client and its release: commands in ../shard-client/STATUS.md.
2. Publish ../meta: command in ../meta/STATUS.md.
3. Add the sign-in secret and tag the launcher so GitHub Actions publishes installers and the
   update feed (run from this folder):

```bash
gh secret set MSA_CLIENT_ID -R OhMarker/shard-launcher --body "335a9f92-08ac-4f4a-9f9c-d0a00d4fb4dc"
```

```bash
git tag v0.1.0 && git push origin v0.1.0
```

4. Turn on the download page (GitHub Pages, `main` branch, `/docs` folder):

```bash
gh api -X POST repos/OhMarker/shard-launcher/pages -f "source[branch]=main" -f "source[path]=/docs"
```

   It appears at https://ohmarker.github.io/shard-launcher/ a minute or two later.

## Gotchas
- This machine's Claude sandbox virtualizes %APPDATA%: files it writes there land in
  AppData\Local\Packages\Claude_...\LocalCache and the user's apps cannot see them. Use the
  Desktop (C:\Users\OhMar\OneDrive\Desktop) or project folders for anything the user must pick up.
- Verification hooks: `SHARD_SMOKE_SCREENSHOT`, `SHARD_SMOKE_INSTALL/LAUNCH`, `SHARD_DATA_DIR`
  (see DECISIONS.md). Use `SHARD_DATA_DIR` outside AppData when running Fabric smoke tests from
  the sandbox.
