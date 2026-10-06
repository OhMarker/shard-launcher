import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { type ModrinthSortIndex } from '@shared/types'
import { invoke, queryKeys } from '@/lib/api'
import { nextSearchOffset } from './mods-utils'

export const SEARCH_PAGE_SIZE = 20

export interface ModrinthSearchParams {
  query: string
  gameVersion: string
  index: ModrinthSortIndex
  categories: readonly string[]
}

/** Offset-paged Modrinth search for the instance's Minecraft version. */
export function useModrinthSearch(params: ModrinthSearchParams, enabled: boolean) {
  const { query, gameVersion, index, categories } = params
  return useInfiniteQuery({
    queryKey: queryKeys.modrinthSearch({ query, gameVersion, index, categories: [...categories] }),
    queryFn: ({ pageParam }) =>
      invoke('modrinth:search', {
        query,
        gameVersion,
        index,
        offset: pageParam,
        limit: SEARCH_PAGE_SIZE,
        categories: categories.length ? [...categories] : undefined
      }),
    initialPageParam: 0,
    getNextPageParam: nextSearchOffset,
    enabled: enabled && gameVersion.length > 0,
    // Keep the previous list visible (dimmed) while a new query or sort loads.
    placeholderData: keepPreviousData,
    staleTime: 60_000
  })
}

export function useModrinthProject(idOrSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.modrinthProject(idOrSlug ?? ''),
    queryFn: () => invoke('modrinth:project', { idOrSlug: idOrSlug ?? '' }),
    enabled: idOrSlug !== null,
    staleTime: 5 * 60_000
  })
}

export function useModrinthVersions(idOrSlug: string | null, gameVersion: string) {
  return useQuery({
    queryKey: queryKeys.modrinthVersions(idOrSlug ?? '', gameVersion),
    queryFn: () => invoke('modrinth:versions', { idOrSlug: idOrSlug ?? '', gameVersion }),
    enabled: idOrSlug !== null && gameVersion.length > 0,
    staleTime: 5 * 60_000
  })
}
