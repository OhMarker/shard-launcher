# Contract between Shard Launcher and the Shard client

The launcher ships first. This document is the agreement the Shard client mod (and the hosted
`meta` repository) must honour so the two can evolve independently. Every payload below is
validated by the launcher with the Zod schemas in `src/shared/schemas/shard.ts`; a payload that
fails validation is ignored and the launcher falls back to its cached or bundled copy.

All hosted files live in a public GitHub repository, `OhMarker/meta`, and are fetched from
`raw.githubusercontent.com`. The URLs can be overridden per build with the `SHARD_*_URL`
environment variables or per user from Settings → Integrations.

| File | Default URL | Owner |
| --- | --- | --- |
| `shard-manifest.json` | `https://raw.githubusercontent.com/OhMarker/meta/main/shard-manifest.json` | client release pipeline |
| `bundled-mods.json` | `https://raw.githubusercontent.com/OhMarker/meta/main/bundled-mods.json` | launcher team |
| `cosmetics.json` | `https://raw.githubusercontent.com/OhMarker/meta/main/cosmetics.json` | cosmetics team |
| `services.json` | `https://raw.githubusercontent.com/OhMarker/meta/main/services.json` | API owner (see section 7) |

Files written by the launcher for the client to read at runtime:

| File | Location |
| --- | --- |
| `launcher-info.json` | `<instance>/launcher-info.json` (rewritten before every launch) |
| `equipped.json` | `<data>/cosmetics/equipped.json` (path is given in `launcher-info.json`) |
| Cosmetic textures | `<data>/cosmetics/textures/<id>.png` (cached copies of every equipped texture) |

`<data>` is `%APPDATA%/Shard` on Windows, `~/Library/Application Support/Shard` on macOS and
`~/.local/share/Shard` on Linux unless the user moved it; always use the absolute paths from
`launcher-info.json` rather than guessing.

---

## 1. `shard-manifest.json`

Describes every published build of the Shard client jar.

```json
{
  "latest": "1.0.0",
  "builds": [
    {
      "version": "1.0.0",
      "minecraft": ["1.21", "1.21.1", "1.21.4"],
      "fabricLoader": ">=0.16.0",
      "url": "https://github.com/OhMarker/shard/releases/download/v1.0.0/shard-1.0.0.jar",
      "sha512": "<128 hex characters>",
      "changelog": "## 1.0.0\n- First public build",
      "releasedAt": "2026-11-01T12:00:00Z"
    }
  ]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `latest` | string | Version string of the newest build. Shown in the Versions and Updates tabs. |
| `builds[].version` | string | Loose semver (`1.2.0`, `1.2.0-beta.1`). Stable sorts above prerelease of the same number. |
| `builds[].minecraft` | string[] | Exact Minecraft version ids this jar runs on. At least one. |
| `builds[].fabricLoader` | string | Semver range of compatible Fabric loader versions. Informational today; the launcher always pins the newest stable loader per Minecraft version. |
| `builds[].url` | string | Direct https download of the jar. |
| `builds[].sha512` | string | Lowercase or uppercase hex, 128 chars. The launcher refuses jars that do not match. |
| `builds[].changelog` | string | Markdown. Rendered in the Updates tab. |
| `builds[].releasedAt` | string | ISO 8601. |

**Selection rule.** For an instance on Minecraft version `V`, the launcher picks the newest
build (by `version`) whose `minecraft` array contains `V`. If none matches, the instance is
**Client pending**: it still installs and launches as Fabric + Shard Core, with a banner. The
check is repeated on every launch, so publishing a new build makes it install itself.

**File naming.** The jar is written to `<instance>/mods/shard-<version>.jar`. Any other
`shard-*.jar` in the folder is removed first. The client should therefore never rely on its own
file name beyond the `shard-` prefix. The launcher treats this file as locked: users cannot
disable or delete it from the Mods tab.

**Publishing a build** = upload the jar to a GitHub release, compute `sha512sum`, add the build
object, bump `latest`, commit. No launcher release is needed.

---

## 2. `bundled-mods.json`

The Shard Core set installed into every Shard instance on every version. A copy ships inside
the launcher (`src/main/mods/bundled-mods.json`) and the hosted copy overrides it whenever it is
reachable and valid, so the set can change without a launcher release.

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-06T00:00:00Z",
  "mods": [
    {
      "slug": "sodium",
      "name": "Sodium",
      "required": false,
      "locked": true,
      "description": "Modern rendering engine.",
      "configFiles": ["config/sodium-options.json"]
    }
  ],
  "sharedFiles": ["options.txt", "servers.dat"],
  "conflicts": [{ "slug": "optifabric", "reason": "Incompatible with Sodium and Iris." }]
}
```

| Field | Meaning |
| --- | --- |
| `mods[].slug` | Modrinth project slug. Resolved to the newest release-channel file for the instance's Minecraft version at install time, with required dependencies. |
| `mods[].required` | Cannot be disabled by the user (Fabric API). |
| `mods[].locked` | Cannot be removed by the user. All bundled mods are locked. |
| `mods[].configFiles` | Paths relative to the instance folder that belong to the **shared config layer**. |
| `sharedFiles` | Extra shared paths not owned by one mod (`options.txt`, `servers.dat`). |
| `conflicts[]` | Modrinth slugs the Mods tab warns about and refuses to install silently. |

A mod with no build for a brand-new Minecraft version is shown as **Waiting for `<name>` update**
and skipped for that instance; the launcher re-checks on every launch.

**Shared config layer.** Files listed in `configFiles` and `sharedFiles` live in
`<data>/shared-config/` and are synchronised into every Shard instance before launch (shared
wins when newer) and back out after the game exits (instance wins when newer). The client does
not need to do anything special; it reads its config from the instance's `config/` folder as
usual. Users can turn the layer off per instance or globally.

---

## 3. `cosmetics.json`

The wardrobe catalogue. A copy ships in `resources/cosmetics/cosmetics.json` (since 0.2.0 only
the OhMarker cape) and is used when the hosted copy is unavailable.

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-06T00:00:00Z",
  "cosmetics": [
    {
      "id": "cape-crystal",
      "type": "cape",
      "name": "Crystal Cape",
      "rarity": "epic",
      "textureUrl": "https://.../cape-crystal.png",
      "previewUrl": "https://.../cape-crystal-preview.png",
      "animated": false,
      "author": "Shard",
      "description": "The signature Shard cape.",
      "availability": "free",
      "tags": ["launch"]
    }
  ]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Stable, unique, URL-safe. Used in `equipped.json`. |
| `type` | enum | `cape`, `cloak`, `hat`, `wings`, `bandana`, `backbling`, `emote` |
| `name` | string | Display name. |
| `rarity` | enum | `common`, `rare`, `epic`, `legendary`, `mythic` |
| `textureUrl` | string | `https://…` or `bundled://cosmetics/textures/<file>.png` (ships inside the launcher). Capes, cloaks and wings use the vanilla **64×32 cape layout** (or a whole multiple of it, such as 4096×2048 for a high-resolution cape) so the launcher can preview them with skinview3d (wings preview as elytra). Other types are free-form; the client defines their model. |
| `previewUrl` | string or null | Optional 2D card image (256×256 recommended). |
| `animated` | boolean | Informational badge; the client decides how to animate. |
| `author` | string | Credit. |
| `description` | string or null | Shown on hover. |
| `availability` | enum | `free` (owned by everyone) or `locked` (needs an unlock; see ownership). |
| `tags` | string[] | Free-form, used for search. |

**Ownership.** Since 0.3.0 the Shard API (section 7) decides ownership of every item its shop
(`GET /v1/shop`) sells, whatever `availability` says: owned when `me.owned` lists it (admins own
everything), otherwise buyable for tokens; while signed out those items are not owned. Items the
shop does not sell, and everything when the API is unavailable, keep the catalogue rule: `free`
is owned, `locked` is shown dimmed unless `<data>/cosmetics/owned.json` (an array of ids) lists
it. Shop items should be `locked` in the catalogue (the bundled `cape-ohmarker` is since 0.3.0)
so a launcher without the API does not hand them out.

---

## 4. `equipped.json`

Written by the launcher whenever the wardrobe changes and again right before each launch
(with the launching account's id). The client reads it at startup and may watch it for changes.

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-06T12:00:00Z",
  "accountId": "069a79f444e94726a5befca90e38aaf5",
  "equipped": {
    "cape": "cape-crystal",
    "hat": "hat-crystal-crown",
    "wings": "wings-glass"
  },
  "emotes": ["emote-crystal-pop", "emote-gg"]
}
```

| Field | Meaning |
| --- | --- |
| `accountId` | Minecraft profile UUID without dashes of the account that launched, or `null`. |
| `equipped` | One cosmetic id per slot: `cape`, `cloak`, `hat`, `wings`, `bandana`, `backbling`. `cape` and `cloak` are mutually exclusive (both render on the back). Missing key = nothing equipped. |
| `emotes` | Ordered emote wheel, at most 8 ids. |

The client must tolerate unknown ids (the catalogue may have changed) and treat them as unequipped.
The texture for every equipped cape/cloak/wings item is guaranteed to exist at
`<data>/cosmetics/textures/<id>.png` after launch preparation (downloaded for remote textures,
copied out of the launcher's resources for bundled ones since 0.2.1). Shard Client 0.5.0+ draws
the equipped cape on the local player.

---

## 5. `launcher-info.json`

Written into the instance folder immediately before the Java process is spawned.

```json
{
  "schemaVersion": 1,
  "launcherVersion": "0.1.0",
  "accountId": "069a79f444e94726a5befca90e38aaf5",
  "username": "Steve",
  "minecraftVersion": "1.21.4",
  "instanceId": "7f1c…",
  "instanceName": "Shard 1.21.4",
  "shardBuild": "1.0.0",
  "accent": "#22D3EE",
  "theme": "dark",
  "equippedPath": "C:\\Users\\me\\AppData\\Roaming\\Shard\\cosmetics\\equipped.json",
  "sharedConfigPath": "C:\\Users\\me\\AppData\\Roaming\\Shard\\shared-config",
  "accountBridge": { "url": "http://127.0.0.1:53123", "secret": "<64 hex chars>" },
  "writtenAt": "2026-10-06T12:00:00Z"
}
```

| Field | Meaning |
| --- | --- |
| `accent` | The user's launcher accent as `#RRGGBB`, so the Shard click GUI can match the launcher theme. |
| `theme` | `dark` or `light`. |
| `shardBuild` | The installed client version, or `null` when launching in Client pending mode. |
| `equippedPath` | Absolute path to `equipped.json`. |
| `sharedConfigPath` | Absolute path to the shared config folder, or `null` when the layer is off for this instance. |
| `accountBridge` | Optional, Shard instances only. Loopback account switching bridge for this launch: `url` is `http://127.0.0.1:<random port>`, `secret` is 32 random bytes as hex (new for every launch, sent as `Authorization: Bearer <secret>`). Open only while that game process runs; requests with an `Origin` header are refused. Absent means no in-game account switching. Endpoints: `shard-client/docs/ACCOUNT-SWITCH-API.md`. |

The launcher also sets environment variables on the game process: `SHARD_INSTANCE_ID`,
`SHARD_INSTANCE_DIR`, `SHARD_MC_VERSION`.

---

## 6. Versioning and compatibility

- Every file carries `schemaVersion` (except `shard-manifest.json`, whose shape is fixed).
  Additive fields are always safe: the launcher ignores unknown keys. Breaking changes bump
  `schemaVersion`; the launcher only accepts versions it knows and otherwise falls back to the
  bundled copy.
- The launcher never requires a specific client version. The client should log the
  `launcherVersion` it saw and degrade gracefully when a field it wants is missing.
- Launcher errors in any of these integrations are non-fatal: the game still launches.

---

## 7. `services.json` and the Shard API

```json
{ "api": "https://shard-api.example.workers.dev" }
```

`services.json` tells the launcher where the Shard API lives, so the API can move without a
launcher release. `api` must be an `https` base URL (no credentials, query or fragment); anything
else is ignored. It is cached like the other manifests (6 hours, last good copy offline). When it
is missing or the API cannot be reached, the online features show "Shard online features are not
available yet" and everything else keeps working.

The API itself is specified in `shard-api/API.md`. What the launcher relies on:

- **Sign-in per Microsoft account:** `POST /v1/auth/challenge`, then Mojang
  `POST https://sessionserver.mojang.com/session/minecraft/join`
  `{ accessToken, selectedProfile, serverId }` (204), then
  `POST /v1/auth/verify { username, serverId }` returns `{ session, me }`. The Minecraft access
  token is sent to Mojang only. The session token stays in the launcher's memory; on a 401 the
  launcher signs in once more and retries.
- `GET /v1/me`, `GET /v1/shop`, `POST /v1/buy`, `POST /v1/equip`, the `/v1/friends*` calls and
  the `/v1/admin/*` calls, with errors as `{ "error": "<message>" }` (the message is shown to the
  player as-is).
- **Equipping a cape** the shop sells sends `POST /v1/equip` and still writes `equipped.json`
  (section 4): the API is what other players see, `equipped.json` is what the local client reads.
- Tokens are earned by the game's heartbeats (`POST /v1/heartbeat`), not by the launcher.
