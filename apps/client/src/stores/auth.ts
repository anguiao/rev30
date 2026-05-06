import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AuthTokenResponse, ResourceTreeNode, User } from '@rev30/shared'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const accessCodes = ref<string[]>([])
  const menus = ref<ResourceTreeNode[]>([])
  const user = ref<User | null>(null)
  const isReady = ref(false)

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null)

  function setSession(session: AuthTokenResponse) {
    accessToken.value = session.accessToken
    accessCodes.value = session.accessCodes
    menus.value = session.menus
    user.value = session.user
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
    setSession,
    clearSession,
    can,
    canAny,
    canAll,
    markReady,
  }
})
