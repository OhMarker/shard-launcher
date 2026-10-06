/** Asset index + object download planning. */
import { join } from 'node:path'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { AssetIndexSchema, type VersionJson } from '@shared/schemas/mojang'
import { downloadBatch, type DownloadTask } from '../net/downloader'
import { readJson } from '../util/fs'

export interface AssetPlan {
  indexId: string
  tasks: DownloadTask[]
}

export interface AssetPlanOptions {
  assetsDir: string
  /** Repair re-hashes every object; a normal launch trusts matching sizes. */
  repair: boolean
  signal?: AbortSignal
}

/** Downloads (or verifies) the asset index, then returns one task per unique object. */
export async function planAssets(version: VersionJson, options: AssetPlanOptions): Promise<AssetPlan> {
  const ref = version.assetIndex
  if (!ref) throw new ShardError('MANIFEST_INVALID', `Version ${version.id} has no asset index`)

  const indexPath = join(options.assetsDir, 'indexes', `${ref.id}.json`)
  await downloadBatch(
    [{ url: ref.url, dest: indexPath, sha1: ref.sha1, size: ref.size, label: `asset index ${ref.id}` }],
    { concurrency: 1, signal: options.signal }
  )
  const index = await readJson(indexPath, AssetIndexSchema)

  const tasks: DownloadTask[] = []
  const seen = new Set<string>()
  for (const [name, object] of Object.entries(index.objects)) {
    if (seen.has(object.hash)) continue
    seen.add(object.hash)
    const prefix = object.hash.slice(0, 2)
    tasks.push({
      url: `${URLS.assetsBase}/${prefix}/${object.hash}`,
      dest: join(options.assetsDir, 'objects', prefix, object.hash),
      sha1: object.hash,
      size: object.size,
      verify: options.repair ? 'hash' : 'size',
      label: name
    })
  }
  return { indexId: ref.id, tasks }
}
