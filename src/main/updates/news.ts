import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { MojangNewsSchema } from '@shared/schemas/mojang'
import { type AppContext, type NewsService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { JsonCache } from '../util/json-cache'
import { mapNews } from './news-mapping'

const log = createLogger('news')

const NEWS_MAX_AGE_MS = 30 * 60_000

export function createNewsService(ctx: AppContext): NewsService {
  let failureLogged = false

  return {
    async minecraft() {
      try {
        const result = await new JsonCache(ctx.paths.cache).fetch(URLS.mojangNews, MojangNewsSchema, {
          maxAgeMs: NEWS_MAX_AGE_MS
        })
        return mapNews(result.data, URLS.mojangNewsImageBase)
      } catch (err) {
        const error = ShardError.from(err)
        if (!failureLogged) {
          failureLogged = true
          log.info(`Minecraft news unavailable (${error.code}: ${error.message})`)
        }
        return []
      }
    }
  }
}

export function registerNewsIpc(ctx: AppContext): void {
  handle('news:minecraft', () => ctx.services.news.minecraft())
}
