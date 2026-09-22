import { useInfiniteQuery, useQueryCache } from '@pinia/colada'
import {
  iconErrorCodeSchema,
  type BuiltinIconListResponse,
  type IconSetIconListQuery,
} from '@rev30/contracts'
import { computed, watch, type ComputedRef } from 'vue'
import { ApiRequestError } from '../../utils/request'
import { resetInfiniteQuery } from './cache'
import { iconListKey } from './query-keys'
import { useIconSearchKeyword } from './useIconSearchKeyword'
import { useIconSearchState } from './useIconSearchState'

const pageSize = 80

export function useIconList<TPage extends BuiltinIconListResponse>(options: {
  source: 'builtin' | 'custom'
  active: ComputedRef<boolean>
  prefix: ComputedRef<string | null>
  query: (input: IconSetIconListQuery) => Promise<TPage>
}) {
  const queryCache = useQueryCache()
  const { keyword, queryKeyword } = useIconSearchKeyword(250)
  const hasSearchKeyword = computed(() => queryKeyword.value.length > 0)
  const queryKey = computed(() =>
    iconListKey(options.source, queryKeyword.value, options.prefix.value, pageSize),
  )

  watch(
    [queryKey, options.active],
    ([key, active], [previousKey, wasActive]) => {
      if (active && (!wasActive || key.some((value, index) => value !== previousKey[index]))) {
        void resetInfiniteQuery(queryCache, key)
      }
    },
    { flush: 'sync' },
  )

  const { data, error, asyncStatus, isLoading, hasNextPage, loadNextPage, refetch } =
    useInfiniteQuery<TPage, Error, string | null>({
      key: queryKey,
      enabled: options.active,
      initialPageParam: null,
      query: ({ pageParam }) =>
        options.query({
          cursor: pageParam ?? undefined,
          pageSize,
          keyword: queryKeyword.value || undefined,
          prefix: options.prefix.value ?? undefined,
        }),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

  const searchState = useIconSearchState({
    error,
    asyncStatus,
    enabled: computed(() => options.active.value && hasSearchKeyword.value),
    refetch,
  })

  watch(error, (error) => {
    if (
      error instanceof ApiRequestError &&
      error.code === iconErrorCodeSchema.enum.INVALID_ICON_CURSOR
    ) {
      void resetInfiniteQuery(queryCache, queryKey.value)
    }
  })

  async function loadMore() {
    if (isLoading.value || !hasNextPage.value) return

    await loadNextPage({ cancelRefetch: false })
  }

  return {
    keyword,
    icons: computed(() =>
      (data.value?.pages ?? []).flatMap<TPage['list'][number]>((page) => page.list),
    ),
    error,
    isLoading,
    hasSearchKeyword,
    scrollKey: computed(() => JSON.stringify(queryKey.value)),
    searchState,
    loadMore,
  }
}
