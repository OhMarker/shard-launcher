/** Pure mapping from launchercontent.mojang.com/v2/news.json to the launcher's NewsItem. */
import { createHash } from 'node:crypto'
import { type MojangNews } from '@shared/schemas/mojang'
import { type NewsItem } from '@shared/types'

export const NEWS_LIMIT = 12

/** Image paths in the feed are relative to launchercontent.mojang.com. */
export function absoluteImageUrl(url: string, base: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return new URL(url, base).toString()
}

function timestamp(date: string): number {
  const parsed = Date.parse(date)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Newest `limit` entries, sorted by date descending. Entries without an id get a stable hash of title + date. */
export function mapNews(payload: Pick<MojangNews, 'entries'>, imageBase: string, limit = NEWS_LIMIT): NewsItem[] {
  const items: NewsItem[] = payload.entries.map((entry) => {
    const image = entry.newsPageImage ?? entry.playPageImage
    return {
      id: entry.id ?? createHash('sha1').update(`${entry.title}\n${entry.date}`).digest('hex'),
      title: entry.title,
      category: entry.category ?? entry.tag ?? null,
      date: entry.date,
      text: entry.text ?? '',
      imageUrl: image ? absoluteImageUrl(image.url, imageBase) : null,
      readMoreUrl: entry.readMoreLink ?? null
    }
  })
  items.sort((a, b) => timestamp(b.date) - timestamp(a.date))
  return items.slice(0, limit)
}
