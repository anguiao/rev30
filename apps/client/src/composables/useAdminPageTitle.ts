import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { findMenuMatch } from '../utils/menu'

export function useAdminPageTitle(fallbackTitle: string) {
  const route = useRoute()
  const auth = useAuthStore()
  const { menus } = storeToRefs(auth)

  return computed(() => findMenuMatch(menus.value, route.path)?.selectedMenu.name ?? fallbackTitle)
}
