import { watchDebounced } from '@vueuse/core'
import { ref, watch } from 'vue'

export function useIconSearchKeyword() {
  const keyword = ref('')
  const queryKeyword = ref('')

  watchDebounced(keyword, (value) => (queryKeyword.value = value.trim()), { debounce: 250 })
  watch(keyword, (value) => {
    if (value.trim() === '') queryKeyword.value = ''
  })

  return { keyword, queryKeyword }
}
