<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { NButton } from 'naive-ui'
import ThemeModeSwitch from '../components/common/ThemeModeSwitch.vue'
import { logout } from '../features/auth'
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
  <main
    class="min-h-screen bg-slate-50 px-6 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
  >
    <section class="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
      <div
        class="mb-10 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
      >
        <div>
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400">Rev30 工作台</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-normal">欢迎回来</h1>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <ThemeModeSwitch />
          <NButton data-test="logout" size="large" :loading="isLoggingOut" @click="handleLogout">
            退出登录
          </NButton>
        </div>
      </div>

      <div v-if="user" class="grid gap-6 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400">当前用户</p>
          <h2 class="mt-3 text-4xl font-semibold tracking-normal">{{ user.nickname }}</h2>
          <p class="mt-3 text-base text-slate-500 dark:text-slate-400">@{{ user.username }}</p>
        </div>

        <dl class="grid gap-4 border-l border-slate-200 pl-6 text-sm dark:border-slate-800">
          <div>
            <dt class="font-medium text-slate-500 dark:text-slate-400">用户名</dt>
            <dd class="mt-1 text-base text-slate-950 dark:text-slate-100">{{ user.username }}</dd>
          </div>
          <div>
            <dt class="font-medium text-slate-500 dark:text-slate-400">联系方式</dt>
            <dd class="mt-1 text-base text-slate-950 dark:text-slate-100">{{ contact }}</dd>
          </div>
        </dl>
      </div>
    </section>
  </main>
</template>
