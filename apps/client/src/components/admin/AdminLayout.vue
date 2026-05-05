<script setup lang="ts">
import { computed } from 'vue'
import { useMutation } from '@pinia/colada'
import { NButton } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { RouterLink, useRouter } from 'vue-router'
import { logout } from '../../features/auth'
import { useAuthStore } from '../../stores/auth'
import ThemeModeSwitch from '../common/ThemeModeSwitch.vue'

type NavItem = {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  {
    to: '/system/users',
    label: '用户管理',
    icon: 'i-[lucide--users]',
  },
  {
    to: '/system/departments',
    label: '部门管理',
    icon: 'i-[lucide--building-2]',
  },
  {
    to: '/system/roles',
    label: '角色管理',
    icon: 'i-[lucide--shield-check]',
  },
  {
    to: '/system/resources',
    label: '资源管理',
    icon: 'i-[lucide--blocks]',
  },
]

const router = useRouter()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

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
  <div
    class="min-h-screen min-w-[1120px] bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100"
  >
    <div class="mx-auto grid min-h-screen max-w-[1600px] grid-cols-[260px_1fr]">
      <aside
        class="flex flex-col border-r border-stone-200 bg-white px-5 py-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header class="mb-8 border-b border-stone-200 pb-5 dark:border-zinc-800">
          <p class="text-lg font-semibold">Rev30</p>
          <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">后台管理</p>
        </header>

        <nav class="flex-1">
          <p class="mb-3 text-xs font-medium tracking-wide text-stone-500 dark:text-zinc-400">
            系统管理
          </p>
          <ul class="space-y-1.5">
            <li v-for="item in navItems" :key="item.to">
              <RouterLink
                :to="item.to"
                class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                active-class="bg-stone-900 text-white hover:bg-stone-900 hover:text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
              >
                <span class="inline-block size-4 shrink-0" :class="item.icon" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </nav>

        <footer class="border-t border-stone-200 pt-4 dark:border-zinc-800">
          <div class="mb-4 flex items-center justify-between">
            <div class="space-y-0.5">
              <p class="text-sm font-medium">{{ user?.nickname ?? '' }}</p>
              <p class="text-xs text-stone-500 dark:text-zinc-400">{{ user?.username ?? '' }}</p>
            </div>
            <ThemeModeSwitch />
          </div>
          <NButton
            data-test="admin-logout"
            block
            strong
            tertiary
            type="default"
            :loading="isLoggingOut"
            @click="handleLogout"
          >
            退出登录
          </NButton>
        </footer>
      </aside>

      <main class="p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
