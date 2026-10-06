import { randomUUID } from 'node:crypto'
import { readFile, rename } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { type ZodType } from 'zod'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { MinecraftServicesErrorSchema } from '@shared/schemas/auth'
import { MojangProfileLookupSchema, SessionProfileSchema, TexturesPayloadSchema } from '@shared/schemas/mojang'
import { SavedSkinListSchema } from '@shared/schemas/storage'
import { type MinecraftProfile, type SavedSkin, type SkinSource, type SkinVariant } from '@shared/types'
import { type AppContext, type SkinService } from '@main/context'
import { handle } from '@main/ipc/router'
import { createLogger } from '@main/logger'
import { httpRequest } from '@main/net/http'
import { exists, hashBuffer, readJson, writeFileAtomic, writeJson } from '@main/util/fs'
import { fromDataUrl, importSkin, isPng, MAX_SKIN_BYTES, PNG_DATA_URL_PREFIX, type ImportedSkin } from './png'

const log = createLogger('skins')

const TEXTURE_HOSTS: ReadonlySet<string> = new Set([
  'textures.minecraft.net',
  'sessionserver.mojang.com',
  'api.minecraftservices.com',
  'raw.githubusercontent.com',
  'cdn.modrinth.com'
])
const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/
const MAX_NAME_LENGTH = 48
const TEXTURE_TIMEOUT_MS = 20_000

function parseHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch (err) {
    throw new ShardError('INVALID_INPUT', `Not a valid URL: ${raw}`, { cause: err })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ShardError('INVALID_INPUT', 'Only http(s) URLs are allowed')
  }
  return url
}

/** Textures may only come from Mojang or the hosts that serve Shard's own cosmetics. */
function parseTextureUrl(raw: string): URL {
  const url = parseHttpUrl(raw)
  const host = url.hostname.toLowerCase()
  if (!TEXTURE_HOSTS.has(host) && !host.endsWith('.mojang.com')) {
    throw new ShardError('INVALID_INPUT', `Textures cannot be loaded from ${host}`)
  }
  return url
}

function parseWith<T>(schema: ZodType<T>, text: string, url: string): T {
  const host = new URL(url).host
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    throw new ShardError('MANIFEST_INVALID', `Invalid JSON from ${host}`, { cause: err })
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ShardError('MANIFEST_INVALID', `Unexpected response shape from ${host}`, {
      details: parsed.error.issues.slice(0, 10)
    })
  }
  return parsed.data
}

function tooLarge(url: string, bytes: number): ShardError {
  return new ShardError('SKIN_INVALID', `The image at ${new URL(url).host} is too large (${bytes} bytes; the limit is ${MAX_SKIN_BYTES})`)
}

/** Downloads a small PNG, refusing oversized or non-PNG payloads before decoding anything. */
async function downloadPng(url: string): Promise<Buffer> {
  const res = await httpRequest(url, { timeoutMs: TEXTURE_TIMEOUT_MS, retries: 1 })
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_SKIN_BYTES) throw tooLarge(url, declared)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_SKIN_BYTES) throw tooLarge(url, buffer.length)
  if (!isPng(buffer)) throw new ShardError('SKIN_INVALID', `${new URL(url).host} did not return a PNG image`)
  return buffer
}

function servicesErrorMessage(text: string): string | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = MinecraftServicesErrorSchema.safeParse(json)
  return parsed.success && parsed.data.errorMessage ? parsed.data.errorMessage : null
}

/** Maps api.minecraftservices.com failures for profile mutations. */
async function throwForStatus(res: Response, action: string): Promise<void> {
  if (res.ok) return
  const text = await res.text().catch(() => '')
  if (res.status === 429) {
    throw new ShardError('RATE_LIMITED', 'Mojang is rate limiting skin changes. Try again in a minute.')
  }
  if (res.status === 401) {
    throw new ShardError('AUTH_REFRESH_FAILED', 'Your Minecraft session is no longer valid. Please sign in again.')
  }
  throw new ShardError('HTTP', servicesErrorMessage(text) ?? `Could not ${action} (HTTP ${res.status})`, {
    details: { status: res.status }
  })
}

interface NewSkinMeta {
  name: string
  source: SkinSource
  sourceLabel: string | null
  /** Overrides the detected variant when the source knows better (Mojang metadata). */
  variant?: SkinVariant
}

class SkinServiceImpl implements SkinService {
  private cache: SavedSkin[] | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly ctx: AppContext) {}

  async library(): Promise<SavedSkin[]> {
    if (this.cache) return this.cache
    this.cache = await this.load()
    return this.cache
  }

  private async load(): Promise<SavedSkin[]> {
    const file = this.ctx.paths.skinsFile
    if (!(await exists(file))) return []
    try {
      return await readJson(file, SavedSkinListSchema)
    } catch (err) {
      const aside = `${file}.corrupt-${Date.now()}`
      log.error(`Skin library is unreadable; moving it to ${aside}`, err)
      await rename(file, aside).catch((renameErr: unknown) => log.error('Could not move the skin library aside', renameErr))
      return []
    }
  }

  private save(list: SavedSkin[]): Promise<void> {
    this.cache = list
    const write = this.writeQueue.then(() => writeJson(this.ctx.paths.skinsFile, list))
    this.writeQueue = write.catch(() => undefined)
    return write
  }

  private async add(skin: ImportedSkin, meta: NewSkinMeta): Promise<SavedSkin> {
    const entry: SavedSkin = {
      id: randomUUID(),
      name: meta.name.trim().slice(0, MAX_NAME_LENGTH) || 'Skin',
      variant: meta.variant ?? skin.variant,
      favorite: false,
      createdAt: new Date().toISOString(),
      source: meta.source,
      sourceLabel: meta.sourceLabel,
      dataUrl: skin.dataUrl
    }
    const list = await this.library()
    await this.save([entry, ...list])
    log.info(`Added skin "${entry.name}" (${entry.variant}, from ${entry.source})`)
    return entry
  }

  async addFromFile(path: string, name?: string): Promise<SavedSkin> {
    let buffer: Buffer
    try {
      buffer = await readFile(path)
    } catch (err) {
      throw ShardError.from(err, 'IO')
    }
    const file = basename(path)
    return this.add(importSkin(buffer), { name: name ?? basename(file, extname(file)), source: 'file', sourceLabel: file })
  }

  async addFromUsername(username: string): Promise<SavedSkin> {
    const name = username.trim()
    if (!USERNAME_RE.test(name)) {
      throw new ShardError('INVALID_INPUT', 'Usernames are 1-16 letters, numbers or underscores')
    }
    const lookupUrl = `${URLS.mojangApi}/users/profiles/minecraft/${encodeURIComponent(name)}`
    const lookupRes = await httpRequest(lookupUrl, { headers: { Accept: 'application/json' }, allowStatus: [204, 404] })
    if (lookupRes.status !== 200) throw new ShardError('NOT_FOUND', `No player named ${name}`)
    const lookup = parseWith(MojangProfileLookupSchema, await lookupRes.text(), lookupUrl)

    const profileUrl = `${URLS.sessionServer}/session/minecraft/profile/${lookup.id}`
    const profileRes = await httpRequest(profileUrl, { headers: { Accept: 'application/json' }, allowStatus: [204] })
    if (profileRes.status !== 200) {
      throw new ShardError('RATE_LIMITED', `Mojang did not return a profile for ${lookup.name}. Try again in a minute.`)
    }
    const profile = parseWith(SessionProfileSchema, await profileRes.text(), profileUrl)
    const property = profile.properties.find((p) => p.name === 'textures')
    if (!property) throw new ShardError('NOT_FOUND', `${profile.name} has no texture data`)
    const payload = parseWith(TexturesPayloadSchema, Buffer.from(property.value, 'base64').toString('utf8'), profileUrl)
    const skin = payload.textures.SKIN
    if (!skin) throw new ShardError('NOT_FOUND', `${profile.name} uses a default skin, so there is nothing to import`)

    const buffer = await this.textureBuffer(skin.url)
    return this.add(importSkin(buffer), {
      name: profile.name,
      source: 'username',
      sourceLabel: profile.name,
      variant: skin.metadata?.model === 'slim' ? 'slim' : 'classic'
    })
  }

  async addFromUrl(url: string, name?: string): Promise<SavedSkin> {
    const parsed = parseHttpUrl(url)
    const buffer = await downloadPng(parsed.toString())
    const fallbackName = basename(parsed.pathname, extname(parsed.pathname)) || parsed.hostname
    return this.add(importSkin(buffer), { name: name ?? fallbackName, source: 'url', sourceLabel: parsed.toString() })
  }

  async saveCurrent(): Promise<SavedSkin> {
    const profile = await this.ctx.services.accounts.getProfile()
    const active = profile.skins.find((s) => s.state === 'ACTIVE')
    if (!active) {
      throw new ShardError('NOT_FOUND', `${profile.name} is using a default skin, so there is nothing to save`)
    }
    const buffer = await this.textureBuffer(active.url)
    return this.add(importSkin(buffer), {
      name: `${profile.name}'s skin`,
      source: 'current',
      sourceLabel: profile.name,
      variant: active.variant === 'SLIM' ? 'slim' : 'classic'
    })
  }

  async update(id: string, patch: { name?: string; favorite?: boolean; variant?: SkinVariant }): Promise<SavedSkin> {
    const list = await this.library()
    const index = list.findIndex((s) => s.id === id)
    const current = list[index]
    if (!current) throw new ShardError('NOT_FOUND', 'That skin is no longer in your library')
    const updated: SavedSkin = {
      ...current,
      name: patch.name?.trim().slice(0, MAX_NAME_LENGTH) || current.name,
      favorite: patch.favorite ?? current.favorite,
      variant: patch.variant ?? current.variant
    }
    const next = [...list]
    next[index] = updated
    await this.save(next)
    return updated
  }

  async delete(id: string): Promise<void> {
    const list = await this.library()
    const next = list.filter((s) => s.id !== id)
    if (next.length !== list.length) await this.save(next)
  }

  async apply(id: string, variant?: SkinVariant): Promise<MinecraftProfile> {
    const skin = (await this.library()).find((s) => s.id === id)
    if (!skin) throw new ShardError('NOT_FOUND', 'That skin is no longer in your library')
    const form = new FormData()
    form.set('variant', variant ?? skin.variant)
    form.set('file', new Blob([fromDataUrl(skin.dataUrl)], { type: 'image/png' }), 'skin.png')
    const res = await this.ctx.services.accounts.servicesFetch('/minecraft/profile/skins', { method: 'POST', body: form })
    await throwForStatus(res, 'change your skin')
    log.info(`Applied skin "${skin.name}" (${variant ?? skin.variant})`)
    return this.freshProfile()
  }

  async applyUrl(url: string, variant: SkinVariant): Promise<MinecraftProfile> {
    const target = parseHttpUrl(url).toString()
    const res = await this.ctx.services.accounts.servicesFetch('/minecraft/profile/skins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant, url: target })
    })
    await throwForStatus(res, 'change your skin')
    return this.freshProfile()
  }

  async reset(): Promise<MinecraftProfile> {
    const res = await this.ctx.services.accounts.servicesFetch('/minecraft/profile/skins/active', { method: 'DELETE' })
    await throwForStatus(res, 'reset your skin')
    return this.freshProfile()
  }

  async setCape(capeId: string | null): Promise<MinecraftProfile> {
    const res =
      capeId === null
        ? await this.ctx.services.accounts.servicesFetch('/minecraft/profile/capes/active', { method: 'DELETE' })
        : await this.ctx.services.accounts.servicesFetch('/minecraft/profile/capes/active', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capeId })
          })
    await throwForStatus(res, 'change your cape')
    return this.freshProfile()
  }

  async fetchTexture(url: string): Promise<string> {
    const buffer = await this.textureBuffer(url)
    return `${PNG_DATA_URL_PREFIX}${buffer.toString('base64')}`
  }

  private freshProfile(): Promise<MinecraftProfile> {
    return this.ctx.services.accounts.getProfile(undefined, true)
  }

  /** Allow-listed texture download with an on-disk cache keyed by the URL's sha1. */
  private async textureBuffer(raw: string): Promise<Buffer> {
    const url = parseTextureUrl(raw).toString()
    const file = join(this.ctx.paths.cache, 'textures', `${hashBuffer(url, 'sha1')}.png`)
    const cached = await readFile(file).catch(() => null)
    if (cached && isPng(cached)) return cached
    const buffer = await downloadPng(url)
    await writeFileAtomic(file, buffer)
    return buffer
  }
}

export function createSkinService(ctx: AppContext): SkinService {
  return new SkinServiceImpl(ctx)
}

export function registerSkinIpc(ctx: AppContext): void {
  const skins = (): SkinService => ctx.services.skins
  handle('skins:library', () => skins().library())
  handle('skins:addFromFile', ({ path, name }) => skins().addFromFile(path, name))
  handle('skins:addFromUsername', ({ username }) => skins().addFromUsername(username))
  handle('skins:addFromUrl', ({ url, name }) => skins().addFromUrl(url, name))
  handle('skins:saveCurrent', () => skins().saveCurrent())
  handle('skins:update', ({ id, patch }) => skins().update(id, patch))
  handle('skins:delete', ({ id }) => skins().delete(id))
  handle('skins:apply', ({ id, variant }) => skins().apply(id, variant))
  handle('skins:applyUrl', ({ url, variant }) => skins().applyUrl(url, variant))
  handle('skins:reset', () => skins().reset())
  handle('skins:setCape', ({ capeId }) => skins().setCape(capeId))
  handle('skins:fetchTexture', ({ url }) => skins().fetchTexture(url))
}
