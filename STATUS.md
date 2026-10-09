# Status (handoff for a new session)

Last updated 2026-10-09.

## 0.6.0: Halloween drop, promo codes, sales, Staff panel (2026-10-09)
- New rarity `special` (event items; orange-to-purple badge with a glow, sorts above mythic) in the
  catalogue types, so cosmetics-v2.json entries with it parse (unknown rarities are still skipped
  per entry). Cosmetics has a **Special** tab (banner + the special items) and shows a featured card
  for every bundle: All shows the OhMarker Set and the Halloween Set, Special shows the Halloween
  Set, a type tab shows bundles with an item of that type.
- Sales: shop items carry `basePrice`/`salePercent` (older APIs: no sale). Cards, Buy buttons and
  bundle cards show the struck-through old price and a "-20%" tag. Header button "Redeem code".
- New sidebar page **Codes** (`pages/CodesPage.tsx`): redeem box, the API's refusal as a readable
  line (404/409/410/429, `redeemErrorMessage`), success card with +tokens and the granted items
  (previews, rarity); the balance and ownership update straight away.
- Staff page has tabs Overview / Players / Shop / Codes / Roles (mods: Players and Roles).
  Overview: 8 stat cards (`/v1/admin/stats` + live codes), best sellers, live codes. Shop: preview,
  base price, sale % with the live final price, shown/hidden switch, sold count, bundle contents,
  filters (on sale, hidden, bundles); an API without `/v1/admin/shop` falls back to prices only.
  Codes: list (status, gives, uses this round / max with a bar, total, round, expiry, on/off,
  note), create/edit dialog (item picker with previews, max uses, local date-time expiry, note,
  active), Reset and Delete with confirms. Pure rules in src/shared/online.ts (`validateCodeDraft`,
  `saleDisplay`, `codeStatus`...), IPC `online:redeem`, `admin:shop|shopUpdate|stats|codes|
  codeSave|codeReset|codeDelete`.
- Dev harness: `SHARD_SMOKE_PAGE` takes `page/hint` (`cosmetics/special`, `admin/codes`,
  `codes/HALLOWEEN` redeems that code once) via `useUi.pageHint`.
- Verified: typecheck, lint, 377 Vitest tests (tests/halloween-codes.test.ts); screenshots
  `docs-screens/0.6.0/` (cosmetics-*, codes-*, staff-*) against the local API (dev auth, fake
  accounts PumpkinPvP/SpookyAce/GhostlyGamer, OhMarkerr) and the local v2 catalogue over http.
  Test sales, a hidden item and two test codes were set for the shots and removed afterwards.
  Not tried by clicking: the code form dialog, reset/delete, sale/hide saves (the API calls are
  unit-tested; the harness cannot click).

## 0.5.0: the OhMarker set (2026-10-09)
- Cosmetics shop sells the owner's set: `cape-ohmarker`, `shield-ohmarker` (new type `shield`: a
  skin for the shield the player holds), `bandana-ohmarker`, 1000 tokens each, and
  `bundle-ohmarker` (new type `bundle`, `items`, `textureUrl: null`) for 2000, which gives whatever
  is missing (prices from `GET /v1/shop`; the API answers 409 when everything is owned).
- Catalogue: the launcher reads `cosmetics-v2.json` from meta first (`URLS.cosmeticsV2`,
  `SHARD_COSMETICS_V2_URL`, or the sibling of a custom cosmetics.json), then `cosmetics.json`, then
  the bundled copy. Entries are validated one by one, so unknown types/fields skip that entry
  instead of failing the file. **`cosmetics-v2.json` and its new images are still local-only in
  `../meta`**: until they are pushed, released launchers keep showing just the cape (from
  cosmetics.json, which stays valid for 0.4.x and older).
- UI: Shield and Bandana tabs; the Equipped panel lists Cape / Shield / Bandana rows with Unequip
  (one item per slot); hovering a shield or bandana shows its 2D picture over the 3D model (the
  model wears only capes); the set is a featured card above the grid ("OhMarker Set — 2000 tokens
  · save 1000", the set picture, the three items with owned ticks, Buy with confirm, "Need N more",
  "Owned"); it explains when buying the missing item alone is cheaper.
- API: equipping a cape/shield/bandana goes to `POST /v1/equip` (capes keep `{ cape }`, others
  `{ slot, id }`, sent only when the shop sells that slot so an older API never clears the cape);
  `me.equipped` parsed (older APIs: cape only); equipped.json gains `shield`/`bandana` keys and
  launch preparation caches every equipped texture, not only capes. CONTRACT.md sections 3, 4, 7.
- Verified: typecheck, lint, 350 Vitest tests (323 before; tests/ohmarker-set.test.ts, cosmetics-online);
  headless screenshots `docs-screens/0.5.0/` against the local API (dev auth, fake accounts) and
  the local v2 catalogue served over http: 2500 tokens owning nothing, owning cape+shield with both
  equipped, and the owner (everything owned). Not tried: buying through the UI (needs a click),
  the shield detail dialog, the Shard Client side of shields/bandanas.

## 0.4.2: staff roles (2026-10-09)
- The Shard API's roles (owner / admin / mod, shard-api/API.md "Roles") reach the launcher:
  `role` on ShardMe/AdminPlayer (older APIs parse as null; `admin` alone reads as admin), IPC
  `admin:staff` and `admin:role`. The sidebar entry is now "Staff" (page key `admin`) and shows for
  any role. Mods see players read-only ("Mods can look players up"; no tokens, grant/revoke or
  shop). A Roles section lists staff and, per `rolesYouCanAssign` in src/shared/online.ts, lets
  owners set Admin/Mod/No role and admins set Mod/No role; removing a role confirms first; "Add
  staff" searches players. Not tried against the live API with a mod account.
- Verified: typecheck, lint, 323 Vitest tests. No screenshot (the harness cannot sign in to the API).

## 0.4.1: keep running while a game runs (2026-10-09)
- The owner's first switch failed: they had one account, "Add account" got Microsoft
  `server_error`, and the launcher then went away (closed), so the game's bridge calls were
  refused. Now closing the window while a game runs hides to the tray (bridge stays up), a failed
  sign-in clears the sign-in window's storage and says to retry / use the code sign-in, and the
  credit reads SwxyzX2.

## 0.4.0: account bridge and credits (2026-10-08)
- While a Shard instance runs, a loopback-only account bridge (random port, per-launch secret,
  Bearer auth, Origin rejected) lets Shard Client 0.8.0 switch accounts in-game
  (`src/main/launch/account-bridge*.ts`, contract in shard-client/docs/ACCOUNT-SWITCH-API.md,
  CONTRACT.md section 5). Not yet tried with a real Microsoft account.
- Credits "Made by OhMarker with the help of SwxyzX2" + License dialog in the sidebar and
  Settings → About; LICENSE (MIT) added at the repo root.
- Verified: typecheck, lint, 314 Vitest tests; headless screenshot docs-screens/bridge-credits/.

## 0.3.0: released 2026-10-08
- https://github.com/OhMarker/shard-launcher/releases/tag/v0.3.0. The tag run's Windows job failed
  on a GitHub upload HTTP 500; `gh workflow run release.yml -f tag=v0.3.0 -f platform=windows`
  rebuilt it, and the website's portable download is served again.
- Live: Shard API https://shard-api.laws-pandayt.workers.dev (deployed by the owner with
  `shard-api/scripts/deploy.ps1` via the Desktop "Put Shard API online.cmd"; safe to rerun), meta
  `services.json` points at it, meta `cosmetics.json` marks `cape-ohmarker` locked, Shard Client
  0.6.0 is `latest`. Admin: OhMarkerr (uuid 4a5e875e479a43f1bfc16c6bd326643d, `ADMIN_UUIDS`).
- Not yet tried with a real Microsoft account against Mojang's join endpoint (none in the sandbox).
- `../shard-api` is a local git repository only (no GitHub remote yet).

- **Shard online** against the Shard API (`../shard-api`, contract in its API.md): token balance and
  "+10 every 10 min you play" on the Cosmetics page, Buy (with confirm) / "Need N more", ownership
  from the API (the bundled `cape-ohmarker` is now `locked`), equipping a cape goes to the API and
  still writes `equipped.json`; a new **Friends** page (add by name, accept/decline/cancel, remove,
  in game vs last seen, 30 s polling); an **Admin** page only for admins (search players, give/take
  tokens, grant/revoke cosmetics, shop prices). Main-process client in `src/main/shard-api/`,
  pure rules in `src/shared/online.ts`. Details: DECISIONS.md "0.3.0", CONTRACT.md section 7.
- The API's address comes from `services.json` in the meta repo (`{ "api": "https://..." }`).
  **It does not exist yet**, so a 0.3.0 build shows "Shard online features are not available yet"
  until it is pushed to meta. meta's `cosmetics.json` still says `cape-ohmarker` is `free`; set it
  to `locked` so launchers without the API stop treating it as owned.
- Verified: typecheck, lint, 294 Vitest tests (265 before); the service run against the local `wrangler dev`
  API (sign-in, buy refusal, equip, friends 404 message, admin tokens/grant/revoke/price); headless
  screenshots in `docs-screens/0.3.0/` (Cosmetics with 0 and 1200 tokens and signed out, Friends
  with a friend in game and a request, Friends with no API, Admin as OhMarkerr). Not verified: a
  real Microsoft account against Mojang's join endpoint (no account in the sandbox).
- The local API's database had to be migrated (`wrangler d1 migrations apply shard --local`) after
  the deploy changed its database id.

## 0.2.0: released 2026-10-08
- https://github.com/OhMarker/shard-launcher/releases/tag/v0.2.0 (Windows, macOS, Linux; the
  website's Download button serves it). Cosmetics are just the OhMarker cape (4096x2048, built by
  `scripts/build-ohmarker-cape.py` from `art/ohmarker-cape/`), the 3D preview draws it with smooth
  filtering, empty wardrobe filters are hidden, no "Lunar" wording. Details: DECISIONS.md "0.2.0".
- meta serves the new `cosmetics.json` (texture hosted in meta) and Shard Client 0.5.0 as latest,
  which draws the equipped cape in-game on your own player.
- **0.2.1 (2026-10-08):** bundled cosmetic textures are copied into `<data>/cosmetics/textures`
  too, so the in-game cape also works when the hosted catalogue is unreachable (265 tests).

## Shard Launcher (this repo)
- Complete and verified: 264 unit tests, lint and typecheck clean, headless renders of every page,
  real end-to-end runs (vanilla and Shard instances downloaded from Mojang/Fabric/Modrinth and reached
  the Minecraft title screen). Details in DECISIONS.md.
- Published at https://github.com/OhMarker/shard-launcher (public). CI on `main` is green; the
  Linux smoke job used to fail intermittently (capturePage UnknownVizError under xvfb) and was fixed
  by disabling hardware acceleration for smoke renders and retrying the capture.
- **Release v0.1.0 is live** (tagged 2026-10-07; `MSA_CLIENT_ID` secret set). Assets: Windows
  portable + x64/arm64 installers with `latest.yml`, Linux AppImage + deb with `latest-linux.yml`,
  macOS universal dmg with `latest-mac.yml` (rebuilt via workflow_dispatch after the signing fix). Builds are unsigned (no `CSC_LINK`), so Windows shows a
  SmartScreen warning and macOS requires "Open Anyway"; the site's FAQ explains both.
- **Website is live at https://ohmarker.github.io/shard-launcher/** (GitHub Pages, `main`/`docs`).
  Verified: the Download button resolves to the 114 MB exe with HTTP 200 and the page shows
  "Version 0.1.0". Short link: https://ohmarker.github.io/shard-launcher/download/
- The release workflow had two fixes on 2026-10-07: an empty optional `CSC_LINK` secret was
  exported as an empty certificate path (macOS job failed with "not a file"), so signing variables
  are now exported only when set; and `workflow_dispatch` (inputs `tag`, `platform`) rebuilds one
  platform for an existing tag: `gh workflow run release.yml -f tag=v0.1.0 -f platform=macos`.
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
- Microsoft sign-in: the owner submitted the Mojang approval form (https://aka.ms/mce-reviewappid)
  on 2026-10-06 and reported on 2026-10-07 that Mojang approved the client id. Sign-in has not
  been re-tested end to end since then. If it still fails with "Invalid app registration",
  suspect approval propagation first, not the code; nothing in the launcher needs to change.
- The hosted `meta` repository is live at https://github.com/OhMarker/meta. The launcher reads
  `https://raw.githubusercontent.com/OhMarker/meta/main/shard-manifest.json`, which lists
  Shard Client 0.4.0 as `latest` (plus 0.3.0 and 0.2.0). A new client version needs only a meta
  push, not a launcher release.

## Shard Client (../shard-client)
- **0.5.0 is published (2026-10-08):** the launcher cape shows in-game (Cosmetics module).
- **0.4.0 was published earlier the same day:** https://github.com/OhMarker/shard-client/releases/tag/v0.4.0,
  meta `latest` 0.4.0. Every Shard 1.21.11 instance installs it on the next launch. It is the UI
  overhaul: new menu, sharp text, Lucide icons, HUD editor, fight modules, Low Fire, Crosshair
  editor, Shield, GUI Scales, borderless fullscreen and Quick setup (../shard-client/CHANGELOG.md).
- Earlier releases 0.2.0 and 0.3.0 are on the same releases page. Build, verification and
  publish steps: ../shard-client/STATUS.md.

## Owner-only steps
None open. Done by the owner: `MSA_CLIENT_ID` secret, tag `v0.1.0`, GitHub Pages enabled
(2026-10-07); creating the shard-client and meta repositories and their first releases
(2026-10-08). Creating releases from the automation sandbox worked for client v0.4.0; creating public
repositories and writing repo secrets were refused earlier, so those stay with the owner.

## Releasing the next launcher version
1. Bump `version` in package.json, commit, `git tag v<version> && git push origin main v<version>`.
2. The Release workflow builds all three platforms and publishes the release plus update feeds;
   installed copies auto-update, the portable exe's Updates tab links to the site, and the website's
   Download button serves the new file automatically (permanent `releases/latest/download` link).
3. If one platform fails, fix it on `main` and rebuild just that platform:
   `gh workflow run release.yml -f tag=v<version> -f platform=<windows|macos|linux>`.

## Gotchas
- This machine's automation sandbox virtualizes %APPDATA%: files it writes there land in
  AppData\Local\Packages\<host>\LocalCache and the user's apps cannot see them. Use the
  Desktop (C:\Users\OhMar\OneDrive\Desktop) or project folders for anything the user must pick up.
- Verification hooks: `SHARD_SMOKE_SCREENSHOT`, `SHARD_SMOKE_INSTALL/LAUNCH`, `SHARD_DATA_DIR`
  (see DECISIONS.md). Use `SHARD_DATA_DIR` outside AppData when running Fabric smoke tests from
  the sandbox.
