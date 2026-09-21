import { watchDebounced } from '@vueuse/core'
import { ref, watch } from 'vue'

export function useIconSearchKeyword(debounce: number) {
  const keyword = ref('')
  const queryKeyword = ref('')

  watchDebounced(keyword, (value) => (queryKeyword.value = value.trim()), { debounce })
  watch(
    keyword,
    (value) => {
      if (value.trim() === '') queryKeyword.value = ''
    },
    { flush: 'sync' },
  )

  return { keyword, queryKeyword }
}
