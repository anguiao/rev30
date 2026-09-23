import { useInfiniteQuery, useQueryCache } from '@pinia/colada'
import {
  iconErrorCodeSchema,
  type BuiltinIconListResponse,
  type CustomIconItem,
  type CustomIconListResponse,
  type IconItem,
} from '@rev30/contracts'
import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ApiRequestError } from '../../../utils/request'
import { iconSearchKeywordKey } from '../cache'
import { listBuiltinIcons, listCustomIcons } from '../requests'
import { useIconSearchKeyword } from '../search/useIconSearchKeyword'
import { useIconSearchRetry } from '../search/useIconSearchRetry'

const pageSize = 80

export function useIconList(options: {
  source: MaybeRefOrGetter<'builtin' | 'custom'>
  active: MaybeRefOrGetter<boolean>
  prefix: MaybeRefOrGetter<string | null>
}) {
  const queryCache = useQueryCache()
  const { keyword, queryKeyword } = useIconSearchKeyword()
  const hasSearchKeyword = computed(() => queryKeyword.value.length > 0)
  const queryKey = computed(() => [
    'content',
    'icon-sets',
    toValue(options.source),
    'icons',
    pageSize,
    ...iconSearchKeywordKey(queryKeyword.value),
    toValue(options.prefix) ?? '',
  ])

  const { data, error, isLoading, hasNextPage, loadNextPage, refetch } = useInfiniteQuery<
    BuiltinIconListResponse | CustomIconListResponse,
    Error,
    string | null
  >({
    key: queryKey,
    enabled: options.active,
    initialPageParam: null,
    query: ({ pageParam }) => {
      const query = toValue(options.source) === 'builtin' ? listBuiltinIcons : listCustomIcons
      return query({
        cursor: pageParam ?? undefined,
        pageSize,
        keyword: queryKeyword.value || undefined,
        prefix: toValue(options.prefix) ?? undefined,
      })
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const { retry } = useIconSearchRetry({
    error,
    isLoading,
    enabled: () => toValue(options.active) && hasSearchKeyword.value,
    refetch,
  })

  watch(error, (error) => {
    if (
      error instanceof ApiRequestError &&
      error.code === iconErrorCodeSchema.enum.INVALID_ICON_CURSOR
    ) {
      const entry = queryCache.get(queryKey.value)
      if (entry === undefined) return

      queryCache.setEntryState(entry, { status: 'pending', data: undefined, error: null })
      void Promise.allSettled([queryCache.invalidateQueries({ key: queryKey.value, exact: true })])
    }
  })

  async function loadMore() {
    if (isLoading.value || !hasNextPage.value) return

    await loadNextPage({ cancelRefetch: false })
  }

  return {
    keyword,
    icons: computed(() =>
      (data.value?.pages ?? []).flatMap<IconItem | CustomIconItem>((page) => page.list),
    ),
    error,
    isLoading,
    hasSearchKeyword,
    scrollKey: computed(() => JSON.stringify(queryKey.value)),
    retry,
    loadMore,
  }
}
