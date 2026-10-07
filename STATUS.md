# Status (handoff for a new session)

Last updated 2026-10-07 by the session that built the project.

## Shard Launcher (this repo)
- Complete and verified: 264 unit tests, lint and typecheck clean, headless renders of every page,
  real end-to-end runs (vanilla and Shard instances downloaded from Mojang/Fabric/Modrinth and reached
  the Minecraft title screen). Details in DECISIONS.md.
- Published at https://github.com/OhMarker/shard-launcher (public). Two commits on `main`.
- Windows builds exist in `dist/`: `ShardLauncher-0.1.0-portable.exe` (single file, for the website)
  and `shard-launcher-setup-0.1.0-x64.exe` / `-arm64.exe` installers.
- `.env` holds `MSA_CLIENT_ID=335a9f92-08ac-4f4a-9f9c-d0a00d4fb4dc` (Azure app "Shard Launcher",
  tenant bdc55f7d-dddc-4492-99f8-65509b6005fd, personal accounts, redirect http://localhost/shard-auth,
  public client flows on). The id is compiled into the builds above.
- Sign-in currently fails at the last step with "Invalid app registration": Mojang has not yet
  approved the client id. The owner submitted the approval form (https://aka.ms/mce-reviewappid)
  on 2026-10-06. Nothing to change; it starts working when Mojang's email arrives.
- The hosted `meta` repository (shard-manifest.json, bundled-mods.json, cosmetics.json) does not exist
  yet; the launcher falls back correctly (Client pending, shipped mod set, bundled cosmetics).

## Shard Client (../shard-client)
- First release built and verified in-game for Minecraft 1.21.11 (see ../shard-client/STATUS.md).

## Next steps the owner may ask for
1. Push ../shard-client to GitHub as OhMarker/shard-client.
2. Create the OhMarker/meta repo with shard-manifest.json pointing at the client jar + sha512,
   plus bundled-mods.json and cosmetics.json copied from this repo, so the launcher installs the
   client automatically.
3. Tag v0.1.0 here (after adding the MSA_CLIENT_ID repo secret) so GitHub Actions publishes
   installers and enables auto-update.
4. Website download page linking the portable exe.

## Gotchas
- This machine's Claude sandbox virtualizes %APPDATA%: files it writes there land in
  AppData\Local\Packages\Claude_...\LocalCache and the user's apps cannot see them. Use the
  Desktop (C:\Users\OhMar\OneDrive\Desktop) or project folders for anything the user must pick up.
- Verification hooks: `SHARD_SMOKE_SCREENSHOT`, `SHARD_SMOKE_INSTALL/LAUNCH`, `SHARD_DATA_DIR`
  (see DECISIONS.md). Use `SHARD_DATA_DIR` outside AppData when running Fabric smoke tests from
  the sandbox.
