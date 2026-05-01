import { defineStore } from 'pinia'
import type { AuthTokenResponse, User } from '@rev30/shared'

type AuthState = {
  accessToken: string | null
  user: User | null
  isReady: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    user: null,
    isReady: false,
  }),
  getters: {
    isAuthenticated: (state) => state.accessToken !== null && state.user !== null,
  },
  actions: {
    setSession(session: AuthTokenResponse) {
      this.accessToken = session.accessToken
      this.user = session.user
    },
    clearSession() {
      this.accessToken = null
      this.user = null
    },
    markReady() {
      this.isReady = true
    },
  },
})
