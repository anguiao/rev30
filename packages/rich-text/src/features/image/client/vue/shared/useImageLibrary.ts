import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface ImageLibraryItem {
  readonly src: string
  readonly name: string
}

export interface RichTextImageLibraryQuery {
  readonly keyword?: string
  readonly page: number
  readonly pageSize: number
}

export interface RichTextImageLibraryResult {
  readonly list: readonly ImageLibraryItem[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

export type ListRichTextLibraryImages = (
  query: RichTextImageLibraryQuery,
) => Promise<RichTextImageLibraryResult>

const pageSize = 20

export function useImageLibrary(listImages: ListRichTextLibraryImages) {
  const searchDraft = ref('')
  const keyword = ref('')
  const page = ref(1)
  const result = ref<RichTextImageLibraryResult | null>(null)
  const isLoading = ref(false)
  const isError = ref(false)
  const hasPreviousPage = computed(() => !isLoading.value && page.value > 1)
  const hasNextPage = computed(
    () => !isLoading.value && result.value !== null && page.value * pageSize < result.value.total,
  )

  let disposed = false
  let requestId = 0

  async function query() {
    if (disposed) {
      return
    }

    const currentRequest = ++requestId
    isLoading.value = true
    isError.value = false
    result.value = null

    try {
      const response = await listImages({
        ...(keyword.value === '' ? {} : { keyword: keyword.value }),
        page: page.value,
        pageSize,
      })
      if (disposed || currentRequest !== requestId) {
        return
      }

      result.value = response
    } catch {
      if (disposed || currentRequest !== requestId) {
        return
      }

      isError.value = true
    } finally {
      if (!disposed && currentRequest === requestId) {
        isLoading.value = false
      }
    }
  }

  function submitSearch() {
    keyword.value = searchDraft.value.trim()
    page.value = 1
    void query()
  }

  function previousPage() {
    if (!hasPreviousPage.value) {
      return
    }

    page.value -= 1
    void query()
  }

  function nextPage() {
    if (!hasNextPage.value) {
      return
    }

    page.value += 1
    void query()
  }

  function dispose() {
    disposed = true
    requestId += 1
  }

  onMounted(() => void query())
  onUnmounted(dispose)

  return {
    searchDraft,
    keyword,
    page,
    result,
    isLoading,
    isError,
    hasPreviousPage,
    hasNextPage,
    submitSearch,
    previousPage,
    nextPage,
    retry: query,
  }
}
