<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { storeToRefs } from 'pinia'
import { NButton, NTooltip } from 'naive-ui'
import { useRouter } from 'vue-router'
import { logout } from '../../../features/auth'
import { useAuthStore } from '../../../stores/auth'
import ThemeModeSwitch from '../../common/ThemeModeSwitch.vue'

defineProps<{
  collapsed: boolean
}>()

const router = useRouter()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const { isLoading: isLoggingOut, ...logoutMutation } = useMutation({
  mutation: () => logout(),
  async onSettled() {
    auth.clearSession()
    await router.replace('/login')
  },
})

function handleLogout() {
  logoutMutation.mutate()
}

async function navigateToAnnouncements() {
  await router.push('/account/announcements')
}

async function navigateToAccountSettings() {
  await router.push('/account/settings')
}
</script>

<template>
  <footer class="shrink-0" :class="collapsed ? 'mt-4' : ''">
    <div
      data-test="admin-sidebar-footer-separator"
      class="border-t border-stone-200 dark:border-zinc-800"
      :class="collapsed ? 'mx-3' : 'mx-5'"
    />
    <div
      data-test="admin-sidebar-footer-content"
      :class="collapsed ? 'flex flex-col items-center gap-3 px-3 pt-4' : 'px-5 pt-4'"
    >
      <template v-if="collapsed">
        <ThemeModeSwitch />
        <NTooltip trigger="hover" placement="right">
          <template #trigger>
            <NButton
              data-test="admin-announcements"
              circle
              quaternary
              type="default"
              aria-label="通知公告"
              @click="navigateToAnnouncements"
            >
              <template #icon>
                <span class="i-[lucide--megaphone] inline-block size-4" aria-hidden="true" />
              </template>
            </NButton>
          </template>
          通知公告
        </NTooltip>
        <NTooltip trigger="hover" placement="right">
          <template #trigger>
            <NButton
              data-test="admin-account-settings"
              circle
              quaternary
              type="default"
              aria-label="个人设置"
              @click="navigateToAccountSettings"
            >
              <template #icon>
                <span class="i-[lucide--user-cog] inline-block size-4" aria-hidden="true" />
              </template>
            </NButton>
          </template>
          个人设置
        </NTooltip>
        <NTooltip trigger="hover" placement="right">
          <template #trigger>
            <NButton
              data-test="admin-logout"
              circle
              quaternary
              type="default"
              :loading="isLoggingOut"
              aria-label="退出登录"
              @click="handleLogout"
            >
              <template #icon>
                <span class="i-[lucide--log-out] inline-block size-4" aria-hidden="true" />
              </template>
            </NButton>
          </template>
          退出登录
        </NTooltip>
      </template>
      <template v-else>
        <div class="mb-4 flex items-center justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <p data-test="admin-sidebar-user" class="truncate text-sm font-medium">
              {{ user?.nickname ?? '' }}
            </p>
            <p class="truncate text-xs text-stone-500 dark:text-zinc-400">
              {{ user?.username ?? '' }}
            </p>
          </div>
          <div class="ml-3 flex shrink-0 items-center gap-1">
            <ThemeModeSwitch />
            <NTooltip trigger="hover" placement="top">
              <template #trigger>
                <NButton
                  data-test="admin-announcements"
                  circle
                  quaternary
                  type="default"
                  aria-label="通知公告"
                  @click="navigateToAnnouncements"
                >
                  <template #icon>
                    <span class="i-[lucide--megaphone] inline-block size-4" aria-hidden="true" />
                  </template>
                </NButton>
              </template>
              通知公告
            </NTooltip>
            <NTooltip trigger="hover" placement="top">
              <template #trigger>
                <NButton
                  data-test="admin-account-settings"
                  circle
                  quaternary
                  type="default"
                  aria-label="个人设置"
                  @click="navigateToAccountSettings"
                >
                  <template #icon>
                    <span class="i-[lucide--user-cog] inline-block size-4" aria-hidden="true" />
                  </template>
                </NButton>
              </template>
              个人设置
            </NTooltip>
          </div>
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
      </template>
    </div>
  </footer>
</template>
