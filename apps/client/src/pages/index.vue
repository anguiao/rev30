<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { NButton } from 'naive-ui'
import { logout } from '../auth/requests'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const user = computed(() => auth.user)
const contact = computed(() => user.value?.email ?? user.value?.phone ?? '未设置联系方式')

const logoutMutation = useMutation({
  mutation: () => logout(),
  async onSettled() {
    auth.clearSession()
    await router.push('/login')
  },
})

const isLoggingOut = computed(() => logoutMutation.isLoading.value)

function handleLogout() {
  logoutMutation.mutate()
}
</script>

<template>
  <main class="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
    <section class="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
      <div class="mb-10 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-medium text-slate-500">Rev30 工作台</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-normal">欢迎回来</h1>
        </div>

        <NButton
          data-test="logout"
          size="large"
          :loading="isLoggingOut"
          @click="handleLogout"
        >
          退出登录
        </NButton>
      </div>

      <div v-if="user" class="grid gap-6 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <p class="text-sm font-medium text-slate-500">当前用户</p>
          <h2 class="mt-3 text-4xl font-semibold tracking-normal">{{ user.nickname }}</h2>
          <p class="mt-3 text-base text-slate-500">@{{ user.username }}</p>
        </div>

        <dl class="grid gap-4 border-l border-slate-200 pl-6 text-sm">
          <div>
            <dt class="font-medium text-slate-500">用户名</dt>
            <dd class="mt-1 text-base text-slate-950">{{ user.username }}</dd>
          </div>
          <div>
            <dt class="font-medium text-slate-500">联系方式</dt>
            <dd class="mt-1 text-base text-slate-950">{{ contact }}</dd>
          </div>
        </dl>
      </div>
    </section>
  </main>
</template>
