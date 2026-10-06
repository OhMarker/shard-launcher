import { describe, expect, it } from 'vitest'
import { URLS } from '@shared/constants'
import { MojangNewsSchema, type MojangNews } from '@shared/schemas/mojang'
import { absoluteImageUrl, mapNews, NEWS_LIMIT } from '@main/updates/news-mapping'

const feed: MojangNews = MojangNewsSchema.parse({
  version: 1,
  entries: [
    {
      id: 'abc',
      title: 'Minecraft Dungeons II is live',
      tag: 'News',
      category: 'Minecraft Dungeons II',
      date: '2026-09-28',
      text: 'Time to brave the unknown.',
      playPageImage: { title: 'play', url: '/v2/images/play.jpg' },
      newsPageImage: { title: 'news', url: '/v2/images/news.jpg' },
      readMoreLink: 'https://www.minecraft.net/article/dungeons-ii'
    },
    {
      title: 'Older post without id or category',
      tag: 'Java',
      date: '2026-09-01',
      playPageImage: { url: 'https://cdn.example/absolute.jpg' }
    },
    {
      id: 'newest',
      title: 'Snapshot 26w40a',
      category: 'Java',
      date: '2026-10-02'
    }
  ]
})

describe('mapNews', () => {
  it('maps fields, prefers the news page image and makes relative URLs absolute', () => {
    const [newest, dungeons, older] = mapNews(feed, URLS.mojangNewsImageBase)
    expect(newest).toEqual({
      id: 'newest',
      title: 'Snapshot 26w40a',
      category: 'Java',
      date: '2026-10-02',
      text: '',
      imageUrl: null,
      readMoreUrl: null
    })
    expect(dungeons).toMatchObject({
      id: 'abc',
      category: 'Minecraft Dungeons II',
      imageUrl: 'https://launchercontent.mojang.com/v2/images/news.jpg',
      readMoreUrl: 'https://www.minecraft.net/article/dungeons-ii'
    })
    expect(older).toMatchObject({
      category: 'Java',
      imageUrl: 'https://cdn.example/absolute.jpg'
    })
  })

  it('derives a stable id from title and date when the feed has none', () => {
    const first = mapNews(feed, URLS.mojangNewsImageBase)[2]
    const again = mapNews(feed, URLS.mojangNewsImageBase)[2]
    expect(first?.id).toMatch(/^[a-f0-9]{40}$/)
    expect(first?.id).toBe(again?.id)
  })

  it('sorts newest first and returns at most NEWS_LIMIT items', () => {
    const entries = Array.from({ length: 30 }, (_, index) => ({
      id: `e${index}`,
      title: `Post ${index}`,
      date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`
    }))
    const items = mapNews({ entries }, URLS.mojangNewsImageBase)
    expect(items).toHaveLength(NEWS_LIMIT)
    expect(items[0]?.date).toBe('2026-01-28')
    for (let i = 1; i < items.length; i++) {
      expect(Date.parse(items[i - 1]?.date ?? '')).toBeGreaterThanOrEqual(Date.parse(items[i]?.date ?? ''))
    }
    expect(mapNews({ entries }, URLS.mojangNewsImageBase, 3)).toHaveLength(3)
  })

  it('tolerates unparseable dates instead of throwing', () => {
    const items = mapNews({ entries: [{ title: 'bad', date: 'someday' }, { title: 'ok', date: '2026-01-01' }] }, URLS.mojangNewsImageBase)
    expect(items.map((i) => i.title)).toEqual(['ok', 'bad'])
  })
})

describe('absoluteImageUrl', () => {
  it('resolves relative paths against the content host and leaves absolute URLs alone', () => {
    expect(absoluteImageUrl('/v2/images/a.jpg', URLS.mojangNewsImageBase)).toBe('https://launchercontent.mojang.com/v2/images/a.jpg')
    expect(absoluteImageUrl('v2/images/a.jpg', URLS.mojangNewsImageBase)).toBe('https://launchercontent.mojang.com/v2/images/a.jpg')
    expect(absoluteImageUrl('HTTPS://cdn.example/a.jpg', URLS.mojangNewsImageBase)).toBe('HTTPS://cdn.example/a.jpg')
  })
})
