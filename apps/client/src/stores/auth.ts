import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  RESOURCE_TYPE_MENU,
  pruneTree,
  treeToArray,
  type AuthTokenResponse,
  type ResourceTreeNode,
  type User,
} from '@rev30/shared'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const accessCodes = ref<string[]>([])
  const menus = ref<ResourceTreeNode[]>([])
  const user = ref<User | null>(null)
  const isReady = ref(false)

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null)

  const visibleMenus = computed(() =>
    pruneTree(menus.value, {
      excludes: (menu) => menu.hidden,
    }),
  )
  const accessibleRoutePaths = computed(() =>
    treeToArray(menus.value).flatMap((menu) =>
      menu.type === RESOURCE_TYPE_MENU && menu.path !== null ? [menu.path] : [],
    ),
  )

  function setSession(session: AuthTokenResponse) {
    accessToken.value = session.accessToken
    accessCodes.value = session.accessCodes
    menus.value = session.menus
    user.value = session.user
  }

  function setUser(nextUser: User) {
    user.value = nextUser
  }

  function clearSession() {
    accessToken.value = null
    accessCodes.value = []
    menus.value = []
    user.value = null
  }

  function can(code: string) {
    return accessCodes.value.includes(code)
  }

  function canAny(codes: string[]) {
    return codes.some((code) => can(code))
  }

  function canAll(codes: string[]) {
    return codes.every((code) => can(code))
  }

  function markReady() {
    isReady.value = true
  }

  return {
    accessToken,
    accessCodes,
    menus,
    user,
    isReady,
    isAuthenticated,
    visibleMenus,
    accessibleRoutePaths,
    setSession,
    setUser,
    clearSession,
    can,
    canAny,
    canAll,
    markReady,
  }
})
