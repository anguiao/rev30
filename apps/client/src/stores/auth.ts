import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AuthTokenResponse, User } from '@rev30/shared'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const user = ref<User | null>(null)
  const isReady = ref(false)

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null)

  function setSession(session: AuthTokenResponse) {
    accessToken.value = session.accessToken
    user.value = session.user
  }

  function clearSession() {
    accessToken.value = null
    user.value = null
  }

  function markReady() {
    isReady.value = true
  }

  return {
    accessToken,
    user,
    isReady,
    isAuthenticated,
    setSession,
    clearSession,
    markReady,
  }
})
