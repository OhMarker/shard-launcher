import { copyFile, rename, rm, stat } from 'node:fs/promises'
import { basename, join, posix, resolve } from 'node:path'
import { shell } from 'electron'
import { ShardError } from '@shared/errors'
import type { ModIndexEntry } from '@shared/schemas/mod-index'
import type {
  BundledModDef,
  BundledModsManifest,
  BundledModStatus,
  CopyModsResult,
  InstalledMod,
  InstallPlan,
  InstallResult,
  Instance,
  InstanceModsView,
  ModrinthVersion,
  MrpackImportResult
} from '@shared/types'
import type { AppContext, ModrinthClient, ModService, ProgressSink } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { primaryFile } from '../modrinth/mapping'
import { FABRIC_LOADER, isCompatible, pickLatestCompatible } from '../modrinth/versions'
import { downloadBatch, type DownloadTask } from '../net/downloader'
import { ensureDir, exists, writeFileAtomic } from '../util/fs'
import {
  canonicalJarName,
  disabledJarName,
  fileNameFor,
  isJarName,
  isModFileName,
  isSafeFileName,
  isShardJarName,
  modDisplayName,
  MODS_DIR
} from './filenames'
import { entryForVersion, toInstalledMod, updateFromVersion, writeModIndex, type ProjectInfo } from './index'
import { acceptsUpdate } from './update-policy'
import { readFabricModJson } from './jar'
import { BundledManifestSource, bundledProjectIds, type BundledProjects } from './manifest'
import { listOverrideFiles, openMrpack, planMrpackFiles } from './mrpack'
import {
  fillProjectInfo,
  planInstall,
  walkRequiredDependencies,
  type BundledProjectRef,
  type InstalledProjectInfo,
  type PlanContext
} from './planner'
import { scanMods, type ScanResult } from './scanner'
import type { ScannedFile } from './scanned'

const log = createLogger('mods')

interface Loaded extends ScanResult {
  instance: Instance
  folder: string
  modsDir: string
  manifest: BundledModsManifest
  bundledProjects: BundledProjects
}

interface InstallSpec {
  version: ModrinthVersion
  source: 'bundled' | 'modrinth'
  info: ProjectInfo
  enabled: boolean
  /** Existing file this version supersedes; removed once the download verifies. */
  replace: ScannedFile | null
}

function isUserMod(entry: ModIndexEntry): boolean {
  return entry.source !== 'bundled' && entry.source !== 'shard'
}

function isLocked(entry: ModIndexEntry): boolean {
  return entry.source === 'bundled' || entry.source === 'shard'
}

function displayName(file: ScannedFile): string {
  return file.entry.title ?? file.entry.fabric?.name ?? modDisplayName(file.canonical)
}

function lockedError(file: ScannedFile, action: string): ShardError {
  const name = displayName(file)
  return file.entry.source === 'shard'
    ? new ShardError('MOD_LOCKED', `The Shard client jar cannot be ${action}`)
    : new ShardError('MOD_LOCKED', `${name} is part of Shard Core and cannot be ${action}. Toggle it from the Shard Core list instead.`)
}

class ModServiceImpl implements ModService {
  private readonly manifests: BundledManifestSource
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(private readonly ctx: AppContext) {
    this.manifests = new BundledManifestSource(ctx)
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  private get modrinth(): ModrinthClient {
    return this.ctx.services.modrinth
  }

  /** Serialises work per instance so two operations never rewrite the index at once. */
  private locked<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(instanceId) ?? Promise.resolve()
    const next = previous.then(fn, fn)
    this.locks.set(instanceId, next)
    const unlock = (): void => {
      if (this.locks.get(instanceId) === next) this.locks.delete(instanceId)
    }
    next.then(unlock, unlock)
    return next
  }

  private lockedPair<T>(a: string, b: string, fn: () => Promise<T>): Promise<T> {
    const [first, second] = [a, b].sort()
    if (first === undefined || second === undefined || first === second) return this.locked(a, fn)
    return this.locked(first, () => this.locked(second, fn))
  }

  private assertNotRunning(instanceId: string): void {
    if (this.ctx.services.launcher.isRunning(instanceId)) {
      throw new ShardError('INSTANCE_RUNNING', 'Close the game before changing its mods')
    }
  }

  private async load(instanceId: string): Promise<Loaded> {
    const instance = this.ctx.services.instances.getRaw(instanceId)
    const folder = this.ctx.services.instances.folder(instanceId)
    const manifest = await this.manifests.get()
    const bundledProjects = await this.manifests.projects(manifest)
    const scan = await scanMods({ folder, manifest, bundledProjects, modrinth: this.modrinth })
    return { instance, folder, modsDir: join(folder, MODS_DIR), manifest, bundledProjects, ...scan }
  }

  private modsOf(loaded: Loaded): InstalledMod[] {
    return loaded.files.map((f) => toInstalledMod(f, loaded.manifest.conflicts))
  }

  private findFile(loaded: Loaded, fileName: string): ScannedFile {
    if (!isSafeFileName(fileName)) throw new ShardError('INVALID_INPUT', 'Invalid mod file name')
    const canonical = canonicalJarName(fileName)
    const file = loaded.files.find((f) => f.fileName === fileName || f.canonical === canonical)
    if (!file) throw new ShardError('NOT_FOUND', `${fileName} is not in this instance's mods folder`)
    return file
  }

  private findBundledFile(loaded: Loaded, def: BundledModDef): ScannedFile | undefined {
    const projectId = loaded.bundledProjects.get(def.slug)?.projectId
    return loaded.files.find(
      (f) =>
        f.entry.source === 'bundled' &&
        (f.entry.slug === def.slug || (projectId !== undefined && f.entry.projectId === projectId))
    )
  }

  private fileForProject(loaded: Loaded, projectId: string): ScannedFile | undefined {
    return loaded.files.find((f) => f.entry.projectId === projectId)
  }

  private planContext(loaded: Loaded): PlanContext {
    const bundled = new Map<string, BundledProjectRef>()
    for (const def of loaded.manifest.mods) {
      const project = loaded.bundledProjects.get(def.slug)
      if (project) bundled.set(project.projectId, { slug: def.slug, title: project.title })
    }
    const installed = new Map<string, InstalledProjectInfo>()
    for (const file of loaded.files) {
      const { entry } = file
      if (!entry.projectId) continue
      installed.set(entry.projectId, {
        projectId: entry.projectId,
        slug: entry.slug ?? null,
        title: displayName(file),
        bundled: entry.source === 'bundled'
      })
    }
    return {
      instanceId: loaded.instance.id,
      gameVersion: loaded.instance.minecraftVersion,
      installed,
      bundled,
      bundledSlugs: new Set(loaded.manifest.mods.map((m) => m.slug)),
      conflicts: loaded.manifest.conflicts
    }
  }

  private progress(instanceId: string, message: string, current: number, total: number, sink?: ProgressSink): void {
    this.ctx.emit('mods:progress', { instanceId, message, current, total })
    sink?.onMessage?.(message)
  }

  private changed(instanceId: string): void {
    this.ctx.emit('mods:changed', { instanceId })
  }

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  private async renameFile(loaded: Loaded, file: ScannedFile, enabled: boolean): Promise<void> {
    const nextName = fileNameFor(file.canonical, enabled)
    const nextPath = join(loaded.modsDir, nextName)
    await rm(nextPath, { force: true })
    await rename(file.path, nextPath)
    file.fileName = nextName
    file.path = nextPath
    file.enabled = enabled
  }

  private async deleteFile(loaded: Loaded, file: ScannedFile): Promise<void> {
    await rm(file.path, { force: true })
    delete loaded.index.files[file.canonical]
    const i = loaded.files.indexOf(file)
    if (i >= 0) loaded.files.splice(i, 1)
  }

  /** Downloads the primary file of each version into mods/ (sha512 verified) and records it. */
  private async installVersions(loaded: Loaded, specs: InstallSpec[], sink: ProgressSink, message: string): Promise<ScannedFile[]> {
    if (specs.length === 0) return []
    const prepared = specs.map((spec) => {
      const file = primaryFile(spec.version)
      if (!file) throw new ShardError('NOT_FOUND', `${spec.version.name} has no downloadable file`)
      const canonical = basename(file.filename.replace(/\\/g, '/'))
      if (!isJarName(canonical) || !isSafeFileName(canonical)) {
        throw new ShardError('INVALID_INPUT', `${file.filename} is not a mod jar`)
      }
      const fileName = fileNameFor(canonical, spec.enabled)
      const dest = join(loaded.modsDir, fileName)
      const task: DownloadTask = { url: file.url, dest, size: file.size, sha512: file.sha512, label: canonical }
      return { spec, file, canonical, fileName, dest, task }
    })
    await ensureDir(loaded.modsDir)
    await downloadBatch(
      prepared.map((p) => p.task),
      {
        concurrency: this.ctx.settings.get().downloadConcurrency,
        signal: sink.signal,
        onProgress: (p) => sink.onProgress?.(p, message)
      }
    )
    const out: ScannedFile[] = []
    for (const { spec, file, canonical, fileName, dest } of prepared) {
      if (spec.replace) {
        if (spec.replace.path !== dest) await rm(spec.replace.path, { force: true })
        if (spec.replace.canonical !== canonical) delete loaded.index.files[spec.replace.canonical]
        const i = loaded.files.indexOf(spec.replace)
        if (i >= 0) loaded.files.splice(i, 1)
      }
      const s = await stat(dest)
      const entry = entryForVersion(spec.version, file, spec.source, spec.info, s, await readFabricModJson(dest))
      loaded.index.files[canonical] = entry
      const existing = loaded.files.find((f) => f.canonical === canonical)
      if (existing) {
        existing.fileName = fileName
        existing.path = dest
        existing.enabled = spec.enabled
        existing.entry = entry
        out.push(existing)
      } else {
        const scanned: ScannedFile = { fileName, canonical, path: dest, enabled: spec.enabled, entry }
        loaded.files.push(scanned)
        out.push(scanned)
      }
    }
    return out
  }

  /** Installs `required` dependencies of `version` that are neither installed nor bundled. */
  private async installRequiredDependencies(loaded: Loaded, version: ModrinthVersion, ownerTitle: string, sink: ProgressSink): Promise<ScannedFile[]> {
    const items = await walkRequiredDependencies(
      this.modrinth,
      this.planContext(loaded),
      [version],
      new Set([version.projectId]),
      [],
      ownerTitle
    )
    if (items.length === 0) return []
    await fillProjectInfo(this.modrinth, items)
    return this.installVersions(
      loaded,
      items.map((item) => ({ version: item.version, source: 'modrinth', info: item, enabled: true, replace: null })),
      sink,
      `Installing dependencies for ${ownerTitle}`
    )
  }

  /** One file per Modrinth project; the most recently installed copy wins. */
  private async removeDuplicates(loaded: Loaded): Promise<void> {
    const groups = new Map<string, ScannedFile[]>()
    for (const file of loaded.files) {
      const { entry } = file
      if (!entry.projectId || (entry.source !== 'bundled' && entry.source !== 'modrinth')) continue
      const group = groups.get(entry.projectId) ?? []
      group.push(file)
      groups.set(entry.projectId, group)
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      group.sort((a, b) => {
        const byInstall = Date.parse(b.entry.installedAt) - Date.parse(a.entry.installedAt)
        return byInstall !== 0 ? byInstall : b.entry.mtimeMs - a.entry.mtimeMs
      })
      for (const stale of group.slice(1)) {
        log.info(`Removing duplicate ${stale.fileName} (superseded by ${group[0]?.fileName ?? 'a newer file'})`)
        await this.deleteFile(loaded, stale)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // ModService
  // ---------------------------------------------------------------------------

  getBundledManifest(opts: { refresh?: boolean } = {}): Promise<BundledModsManifest> {
    return this.manifests.get(opts)
  }

  view(instanceId: string): Promise<InstanceModsView> {
    return this.locked(instanceId, async () => this.buildView(await this.load(instanceId)))
  }

  private buildView(loaded: Loaded): InstanceModsView {
    const disabled = new Set(loaded.instance.settings.disabledBundled)
    const waiting = new Set(loaded.index.waiting)
    const core: BundledModStatus[] = loaded.manifest.mods.map((def) => {
      const file = this.findBundledFile(loaded, def)
      const installed = file ? toInstalledMod(file, loaded.manifest.conflicts) : null
      const state = disabled.has(def.slug)
        ? 'disabled'
        : installed
          ? 'installed'
          : waiting.has(def.slug)
            ? 'waiting'
            : 'not-installed'
      return { def, state, installed }
    })
    const shardFile = loaded.files.find((f) => f.entry.source === 'shard')
    const shardMod = shardFile ? toInstalledMod(shardFile, loaded.manifest.conflicts) : null
    return {
      instanceId: loaded.instance.id,
      minecraftVersion: loaded.instance.minecraftVersion,
      core,
      shard: {
        state: shardMod ? 'installed' : loaded.instance.type === 'shard' ? 'pending' : 'not-applicable',
        mod: shardMod,
        build: loaded.instance.shardBuild
      },
      yours: loaded.files.filter((f) => isUserMod(f.entry)).map((f) => toInstalledMod(f, loaded.manifest.conflicts)),
      manifest: loaded.manifest
    }
  }

  syncBundled(instanceId: string, opts: { checkUpdates?: boolean } & ProgressSink = {}): Promise<InstanceModsView> {
    return this.locked(instanceId, async () => {
      const loaded = await this.load(instanceId)
      if (loaded.instance.type !== 'shard') return this.buildView(loaded)
      if (this.ctx.services.launcher.isRunning(instanceId)) {
        log.info(`Skipping bundled mod sync for ${instanceId}: the game is running`)
        return this.buildView(loaded)
      }
      const { instance, manifest } = loaded
      const mc = instance.minecraftVersion
      const disabled = new Set(instance.settings.disabledBundled)
      const waiting = new Set(loaded.index.waiting)
      const total = manifest.mods.length
      const throwIfCancelled = (): void => {
        if (opts.signal?.aborted) throw new ShardError('CANCELLED', 'Mod sync cancelled')
      }

      // Enabled/disabled state of bundled files follows the instance settings.
      for (const def of manifest.mods) {
        const file = this.findBundledFile(loaded, def)
        if (!file) continue
        const shouldEnable = !disabled.has(def.slug)
        if (file.enabled !== shouldEnable) await this.renameFile(loaded, file, shouldEnable)
      }

      // One request covers update checks for every installed bundled mod.
      let updates: Record<string, ModrinthVersion> = {}
      if (opts.checkUpdates) {
        const hashes: string[] = []
        for (const def of manifest.mods) {
          if (disabled.has(def.slug)) continue
          const file = this.findBundledFile(loaded, def)
          if (file) hashes.push(file.entry.sha512)
        }
        if (hashes.length > 0) {
          this.progress(instanceId, 'Checking Shard Core for updates', 0, total, opts)
          try {
            updates = await this.modrinth.getUpdates(hashes, { gameVersion: mc, loaders: [FABRIC_LOADER] })
          } catch (err) {
            const e = ShardError.from(err)
            if (e.code === 'CANCELLED') throw e
            log.warn(`Bundled update check failed (${e.code}: ${e.message})`)
          }
        }
      }

      let current = 0
      for (const def of manifest.mods) {
        throwIfCancelled()
        current++
        if (disabled.has(def.slug)) continue
        const project = loaded.bundledProjects.get(def.slug)
        const info: ProjectInfo = { slug: def.slug, title: project?.title ?? def.name, iconUrl: project?.iconUrl ?? null }
        const existing = this.findBundledFile(loaded, def)
        try {
          if (existing) {
            let next: ModrinthVersion | undefined = updates[existing.entry.sha512]
            if (next && !acceptsUpdate(existing.entry.versionNumber, next)) {
              // The update endpoint only knows "newest", which may be an alpha. Look for the
              // newest release-channel build instead so a release install never regresses.
              log.info(`Skipping ${def.name} ${next.versionNumber} (${next.versionType}); looking for a release build`)
              const versions = await this.modrinth.getVersions(def.slug, { gameVersion: mc, loaders: [FABRIC_LOADER] })
              const release = pickLatestCompatible(versions, mc)
              next = release && release.versionType === 'release' ? release : undefined
            }
            if (next && next.id !== existing.entry.versionId && isCompatible(next, mc)) {
              this.progress(instanceId, `Updating ${def.name}`, current, total, opts)
              await this.installVersions(
                loaded,
                [{ version: next, source: 'bundled', info, enabled: true, replace: existing }],
                opts,
                `Updating ${def.name}`
              )
              log.info(`Updated ${def.name} to ${next.versionNumber}`)
            }
            continue
          }
          this.progress(instanceId, `Installing ${def.name}`, current, total, opts)
          const versions = await this.modrinth.getVersions(def.slug, { gameVersion: mc, loaders: [FABRIC_LOADER] })
          const pick = pickLatestCompatible(versions, mc)
          if (!pick) {
            waiting.add(def.slug)
            log.info(`${def.name} has no Fabric build for ${mc} yet; waiting`)
            continue
          }
          waiting.delete(def.slug)
          await this.installVersions(
            loaded,
            [{ version: pick, source: 'bundled', info, enabled: true, replace: null }],
            opts,
            `Installing ${def.name}`
          )
          await this.installRequiredDependencies(loaded, pick, def.name, opts)
          log.info(`Installed ${def.name} ${pick.versionNumber}`)
        } catch (err) {
          const e = ShardError.from(err)
          if (e.code === 'CANCELLED') throw e
          log.warn(`Skipping ${def.name} this time (${e.code}: ${e.message})`)
        }
      }

      await this.removeDuplicates(loaded)
      loaded.index.waiting = [...waiting].sort()
      await writeModIndex(loaded.folder, loaded.index)
      this.progress(instanceId, 'Shard Core is up to date', total, total, opts)
      this.changed(instanceId)
      return this.buildView(loaded)
    })
  }

  setEnabled(instanceId: string, fileName: string, enabled: boolean): Promise<void> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      const file = this.findFile(loaded, fileName)
      if (isLocked(file.entry)) throw lockedError(file, enabled ? 'enabled here' : 'disabled here')
      if (file.enabled !== enabled) await this.renameFile(loaded, file, enabled)
      this.changed(instanceId)
    })
  }

  setBundledEnabled(instanceId: string, slug: string, enabled: boolean): Promise<void> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      const def = loaded.manifest.mods.find((m) => m.slug === slug)
      if (!def) throw new ShardError('NOT_FOUND', `${slug} is not part of Shard Core`)
      if (def.required && !enabled) {
        throw new ShardError('MOD_LOCKED', `${def.name} is required by Shard and cannot be disabled`)
      }
      const disabled = new Set(loaded.instance.settings.disabledBundled)
      if (enabled) disabled.delete(slug)
      else disabled.add(slug)
      await this.ctx.services.instances.save({
        ...loaded.instance,
        settings: { ...loaded.instance.settings, disabledBundled: [...disabled].sort() }
      })
      const file = this.findBundledFile(loaded, def)
      if (file && file.enabled !== enabled) await this.renameFile(loaded, file, enabled)
      this.changed(instanceId)
    })
  }

  remove(instanceId: string, fileName: string): Promise<void> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      const file = this.findFile(loaded, fileName)
      if (isLocked(file.entry)) throw lockedError(file, 'removed')
      await this.deleteFile(loaded, file)
      await writeModIndex(loaded.folder, loaded.index)
      this.changed(instanceId)
    })
  }

  importFiles(instanceId: string, paths: string[]): Promise<InstalledMod[]> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      await ensureDir(loaded.modsDir)
      const imported = new Set<string>()
      for (const source of paths) {
        const name = basename(source)
        if (!isJarName(name)) throw new ShardError('INVALID_INPUT', `${name} is not a .jar file`)
        if (isShardJarName(name)) throw new ShardError('MOD_LOCKED', `${name} looks like a Shard client jar and is managed by the launcher`)
        const existing = loaded.index.files[name]
        if (existing && isLocked(existing)) {
          throw new ShardError('MOD_LOCKED', `${name} is part of Shard Core and is managed by the launcher`)
        }
        const dest = join(loaded.modsDir, name)
        if (resolve(source) !== resolve(dest)) await copyFile(source, dest)
        await rm(join(loaded.modsDir, disabledJarName(name)), { force: true })
        imported.add(name)
      }
      const rescanned = await scanMods({
        folder: loaded.folder,
        manifest: loaded.manifest,
        bundledProjects: loaded.bundledProjects,
        modrinth: this.modrinth
      })
      this.changed(instanceId)
      return rescanned.files.filter((f) => imported.has(f.canonical)).map((f) => toInstalledMod(f, loaded.manifest.conflicts))
    })
  }

  importMrpack(instanceId: string, path: string): Promise<MrpackImportResult> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      const mc = loaded.instance.minecraftVersion
      const { index: pack, zip } = openMrpack(path)
      const packMc = pack.dependencies.minecraft
      if (packMc !== mc) {
        throw new ShardError(
          'VERSION_UNSUPPORTED',
          `${pack.name} is built for Minecraft ${packMc ?? 'an unknown version'}, but this instance runs ${mc}. Create an instance for ${packMc ?? 'that version'} to import it.`,
          { details: { packVersion: packMc ?? null, instanceVersion: mc } }
        )
      }

      let known: Record<string, ModrinthVersion> = {}
      const conflictIds = new Set<string>()
      try {
        known = await this.modrinth.getVersionsByHashes(pack.files.map((f) => f.hashes.sha512))
        const projectIds = [...new Set(Object.values(known).map((v) => v.projectId))]
        if (projectIds.length > 0) {
          const conflictSlugs = new Set(loaded.manifest.conflicts.map((c) => c.slug))
          for (const project of await this.modrinth.getProjects(projectIds)) {
            if (conflictSlugs.has(project.slug) || conflictSlugs.has(project.id)) conflictIds.add(project.id)
          }
        }
      } catch (err) {
        const e = ShardError.from(err)
        log.warn(`Could not identify pack files on Modrinth (${e.code}: ${e.message}); importing by path only`)
      }

      const lockedJarNames = new Set(loaded.files.filter((f) => isLocked(f.entry)).map((f) => f.canonical))
      const plan = planMrpackFiles(pack, {
        folder: loaded.folder,
        lockedJarNames,
        bundledProjectIds: bundledProjectIds(loaded.bundledProjects),
        knownVersions: known,
        conflictIds
      })
      const skipped = [...plan.skipped]

      const total = plan.files.length
      this.progress(instanceId, `Downloading ${pack.name}`, 0, total)
      await downloadBatch(
        plan.files.map((f) => ({
          url: f.url,
          dest: f.dest,
          size: f.size,
          sha512: f.sha512,
          label: posix.basename(f.relativePath)
        })),
        {
          concurrency: this.ctx.settings.get().downloadConcurrency,
          onProgress: (p) =>
            this.progress(instanceId, p.currentFile ? `Downloading ${p.currentFile}` : `Downloading ${pack.name}`, p.doneFiles, total)
        }
      )

      const overrides = listOverrideFiles(zip)
      skipped.push(...overrides.skipped)
      let written = 0
      for (const file of overrides.files) {
        const base = posix.basename(file.relativePath)
        if (
          file.relativePath.startsWith(`${MODS_DIR}/`) &&
          isModFileName(base) &&
          (isShardJarName(base) || lockedJarNames.has(canonicalJarName(base)))
        ) {
          skipped.push(`${base}: would overwrite a Shard Core file`)
          continue
        }
        await writeFileAtomic(join(loaded.folder, ...file.relativePath.split('/')), file.data())
        written++
      }

      await scanMods({
        folder: loaded.folder,
        manifest: loaded.manifest,
        bundledProjects: loaded.bundledProjects,
        modrinth: this.modrinth
      })
      this.progress(instanceId, `Imported ${pack.name}`, total, total)
      this.changed(instanceId)
      log.info(`Imported ${pack.name}: ${plan.files.length} downloads, ${written} override files, ${skipped.length} skipped`)
      return { name: pack.name, installed: plan.files.length + written, skipped }
    })
  }

  /** Refreshes `update` for every user-installed Modrinth mod. Returns true when anything changed. */
  private async refreshUpdates(loaded: Loaded): Promise<boolean> {
    const candidates = loaded.files.filter((f) => f.entry.source === 'modrinth' && f.entry.projectId !== undefined)
    if (candidates.length === 0) return false
    const updates = await this.modrinth.getUpdates(
      candidates.map((f) => f.entry.sha512),
      { gameVersion: loaded.instance.minecraftVersion, loaders: [FABRIC_LOADER] }
    )
    let changed = false
    for (const file of candidates) {
      const next = updates[file.entry.sha512]
      const update =
        next && next.id !== file.entry.versionId && acceptsUpdate(file.entry.versionNumber, next)
          ? updateFromVersion(next)
          : null
      if ((file.entry.update ?? null)?.versionId === update?.versionId) continue
      file.entry = { ...file.entry, update }
      loaded.index.files[file.canonical] = file.entry
      changed = true
    }
    if (changed) await writeModIndex(loaded.folder, loaded.index)
    return changed
  }

  checkUpdates(instanceId: string): Promise<InstalledMod[]> {
    return this.locked(instanceId, async () => {
      const loaded = await this.load(instanceId)
      if (await this.refreshUpdates(loaded)) this.changed(instanceId)
      return this.modsOf(loaded)
    })
  }

  /** Downloads the pending update for one user mod and installs any newly required dependencies. */
  private async applyUpdate(loaded: Loaded, file: ScannedFile, sink: ProgressSink): Promise<ScannedFile> {
    const update = file.entry.update
    if (!update) throw new ShardError('NOT_FOUND', `${displayName(file)} is already up to date`)
    const version = await this.modrinth.getVersion(update.versionId)
    const [installed] = await this.installVersions(
      loaded,
      [{ version, source: 'modrinth', info: file.entry, enabled: file.enabled, replace: file }],
      sink,
      `Updating ${displayName(file)}`
    )
    if (!installed) throw new ShardError('UNKNOWN', `Update of ${displayName(file)} produced no file`)
    await this.installRequiredDependencies(loaded, version, displayName(installed), sink)
    return installed
  }

  update(instanceId: string, fileName: string): Promise<InstalledMod> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      const file = this.findFile(loaded, fileName)
      if (isLocked(file.entry)) throw lockedError(file, 'updated here; Shard Core updates automatically before launch')
      if (file.entry.source !== 'modrinth') {
        throw new ShardError('NOT_FOUND', `${displayName(file)} is not a Modrinth mod, so there is nothing to update it from`)
      }
      if (!file.entry.update) await this.refreshUpdates(loaded)
      const installed = await this.applyUpdate(loaded, file, {})
      await writeModIndex(loaded.folder, loaded.index)
      this.changed(instanceId)
      return toInstalledMod(installed, loaded.manifest.conflicts)
    })
  }

  updateAll(instanceId: string): Promise<{ updated: string[] }> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      await this.refreshUpdates(loaded)
      const pending = loaded.files.filter((f) => f.entry.source === 'modrinth' && f.entry.update)
      const updated: string[] = []
      const total = pending.length
      for (const [i, file] of pending.entries()) {
        this.progress(instanceId, `Updating ${displayName(file)}`, i, total)
        const installed = await this.applyUpdate(loaded, file, {})
        updated.push(installed.fileName)
        await writeModIndex(loaded.folder, loaded.index)
      }
      if (updated.length > 0) {
        this.progress(instanceId, `Updated ${updated.length} mod${updated.length === 1 ? '' : 's'}`, total, total)
        this.changed(instanceId)
      }
      return { updated }
    })
  }

  copyTo(fromInstanceId: string, toInstanceId: string): Promise<CopyModsResult> {
    if (fromInstanceId === toInstanceId) {
      throw new ShardError('INVALID_INPUT', 'Pick a different instance to copy mods to')
    }
    return this.lockedPair(fromInstanceId, toInstanceId, async () => {
      this.assertNotRunning(toInstanceId)
      const source = await this.load(fromInstanceId)
      const target = await this.load(toInstanceId)
      const targetMc = target.instance.minecraftVersion
      const result: CopyModsResult = { copied: [], failed: [] }
      const targetProjects = new Set(target.files.map((f) => f.entry.projectId).filter((id): id is string => id !== undefined))

      const yours = source.files.filter((f) => isUserMod(f.entry))
      for (const [i, file] of yours.entries()) {
        const name = displayName(file)
        this.progress(toInstanceId, `Copying ${name}`, i, yours.length)
        const { projectId } = file.entry
        if (file.entry.source !== 'modrinth' || projectId === undefined) {
          result.failed.push({ name, reason: 'Not a Modrinth mod, copy it manually' })
          continue
        }
        if (targetProjects.has(projectId)) continue
        try {
          const versions = await this.modrinth.getVersions(projectId, { gameVersion: targetMc, loaders: [FABRIC_LOADER] })
          const pick = pickLatestCompatible(versions, targetMc)
          if (!pick) {
            result.failed.push({ name, reason: `No build for ${targetMc}` })
            continue
          }
          const [installed] = await this.installVersions(
            target,
            [{ version: pick, source: 'modrinth', info: file.entry, enabled: file.enabled, replace: null }],
            {},
            `Copying ${name}`
          )
          targetProjects.add(projectId)
          if (installed) result.copied.push(installed.fileName)
          for (const dep of await this.installRequiredDependencies(target, pick, name, {})) {
            if (dep.entry.projectId) targetProjects.add(dep.entry.projectId)
          }
        } catch (err) {
          const e = ShardError.from(err)
          if (e.code === 'CANCELLED') throw e
          result.failed.push({ name, reason: e.message })
        }
      }
      await writeModIndex(target.folder, target.index)
      this.progress(toInstanceId, `Copied ${result.copied.length} mod${result.copied.length === 1 ? '' : 's'}`, yours.length, yours.length)
      this.changed(toInstanceId)
      return result
    })
  }

  plan(instanceId: string, projectId: string, versionId?: string): Promise<InstallPlan> {
    return this.locked(instanceId, async () => {
      const loaded = await this.load(instanceId)
      return planInstall(this.modrinth, this.planContext(loaded), projectId, versionId)
    })
  }

  install(instanceId: string, projectId: string, versionId: string | undefined, includeOptional: string[]): Promise<InstallResult> {
    return this.locked(instanceId, async () => {
      this.assertNotRunning(instanceId)
      const loaded = await this.load(instanceId)
      const plan = await planInstall(this.modrinth, this.planContext(loaded), projectId, versionId)
      if (plan.conflicts.length > 0) {
        throw new ShardError('MOD_CONFLICT', plan.conflicts.map((c) => c.reason).join(' '), {
          details: { conflicts: plan.conflicts }
        })
      }
      const skipped: string[] = []
      if (plan.items.length === 0) {
        for (const existing of plan.alreadyInstalled) {
          skipped.push(`${existing.title}: ${existing.bundled ? 'Already part of Shard Core' : 'Already installed'}`)
        }
        return { installed: [], skipped }
      }
      const chosen = new Set(includeOptional)
      const optional = plan.optional.filter((item) => chosen.has(item.projectId) || (item.slug !== null && chosen.has(item.slug)))
      const requestedTitle = plan.items[0]?.title ?? projectId
      const specs: InstallSpec[] = [...plan.items, ...optional].map((item) => ({
        version: item.version,
        source: 'modrinth',
        info: item,
        enabled: true,
        replace: this.fileForProject(loaded, item.projectId) ?? null
      }))
      this.progress(instanceId, `Installing ${requestedTitle}`, 0, specs.length)
      const files = await this.installVersions(loaded, specs, {}, `Installing ${requestedTitle}`)
      for (const item of optional) {
        files.push(...(await this.installRequiredDependencies(loaded, item.version, item.title, {})))
      }
      await writeModIndex(loaded.folder, loaded.index)
      this.progress(instanceId, `Installed ${requestedTitle}`, specs.length, specs.length)
      this.changed(instanceId)
      log.info(`Installed ${requestedTitle} into ${instanceId} (${files.length} file(s))`)
      return { installed: files.map((f) => toInstalledMod(f, loaded.manifest.conflicts)), skipped }
    })
  }

  listInstalled(instanceId: string): Promise<InstalledMod[]> {
    return this.locked(instanceId, async () => this.modsOf(await this.load(instanceId)))
  }
}

export function createModService(ctx: AppContext): ModService {
  return new ModServiceImpl(ctx)
}

export function registerModIpc(ctx: AppContext): void {
  const mods = (): ModService => ctx.services.mods
  const modrinth = (): ModrinthClient => ctx.services.modrinth

  handle('mods:view', ({ instanceId }) => mods().view(instanceId))
  handle('mods:bundledManifest', () => mods().getBundledManifest())
  handle('mods:syncBundled', ({ instanceId }) => mods().syncBundled(instanceId, { checkUpdates: true }))
  handle('mods:setEnabled', ({ instanceId, fileName, enabled }) => mods().setEnabled(instanceId, fileName, enabled))
  handle('mods:setBundledEnabled', ({ instanceId, slug, enabled }) => mods().setBundledEnabled(instanceId, slug, enabled))
  handle('mods:remove', ({ instanceId, fileName }) => mods().remove(instanceId, fileName))
  handle('mods:importFiles', ({ instanceId, paths }) => mods().importFiles(instanceId, paths))
  handle('mods:importMrpack', ({ instanceId, path }) => mods().importMrpack(instanceId, path))
  handle('mods:checkUpdates', ({ instanceId }) => mods().checkUpdates(instanceId))
  handle('mods:updateAll', ({ instanceId }) => mods().updateAll(instanceId))
  handle('mods:update', ({ instanceId, fileName }) => mods().update(instanceId, fileName))
  handle('mods:copyTo', ({ fromInstanceId, toInstanceId }) => mods().copyTo(fromInstanceId, toInstanceId))
  handle('mods:openFile', async ({ instanceId, fileName }) => {
    if (!isSafeFileName(fileName)) throw new ShardError('INVALID_INPUT', 'Invalid mod file name')
    const modsDir = join(ctx.services.instances.folder(instanceId), MODS_DIR)
    for (const candidate of [fileName, canonicalJarName(fileName), disabledJarName(fileName)]) {
      const path = join(modsDir, candidate)
      if (await exists(path)) {
        shell.showItemInFolder(path)
        return
      }
    }
    throw new ShardError('NOT_FOUND', `${fileName} is not in this instance's mods folder`)
  })

  handle('modrinth:search', (params) => modrinth().search(params))
  handle('modrinth:project', ({ idOrSlug }) => modrinth().getProject(idOrSlug))
  handle('modrinth:versions', ({ idOrSlug, gameVersion }) =>
    modrinth().getVersions(idOrSlug, { gameVersion, loaders: [FABRIC_LOADER] })
  )
  handle('modrinth:plan', ({ instanceId, projectId, versionId }) => mods().plan(instanceId, projectId, versionId))
  handle('modrinth:install', ({ instanceId, projectId, versionId, includeOptional }) =>
    mods().install(instanceId, projectId, versionId, includeOptional)
  )
}
