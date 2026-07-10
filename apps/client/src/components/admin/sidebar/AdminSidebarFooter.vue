<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { storeToRefs } from 'pinia'
import { NButton, useDialog, type ButtonProps } from 'naive-ui'
import { useRouter } from 'vue-router'
import { logout } from '../../../features/auth'
import { UserAvatar } from '../../../features/users'
import { useAuthStore } from '../../../stores/auth'
import ThemeModeSwitch from '../../common/ThemeModeSwitch.vue'

defineProps<{
  collapsed: boolean
}>()

const router = useRouter()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const dialog = useDialog()

const { isLoading: isLoggingOut, ...logoutMutation } = useMutation({
  mutation: () => logout(),
  onSettled() {
    auth.clearSession()
  },
})

function confirmLogout() {
  const logoutPositiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'admin-logout-confirm',
  }
  const logoutNegativeButtonProps: ButtonProps & Record<string, unknown> = {
    'data-test': 'admin-logout-cancel',
  }

  if (isLoggingOut.value) return

  dialog.warning({
    title: '确认退出登录',
    content: '确定退出当前账号吗？',
    positiveText: '退出登录',
    negativeText: '取消',
    positiveButtonProps: logoutPositiveButtonProps,
    negativeButtonProps: logoutNegativeButtonProps,
    onPositiveClick() {
      logoutMutation.mutate()
    },
  })
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
        <button
          v-if="user"
          data-test="admin-account-settings"
          type="button"
          class="inline-flex cursor-pointer rounded-full border-0 bg-transparent p-0 text-current transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="个人设置"
          title="个人设置"
          @click="navigateToAccountSettings"
        >
          <UserAvatar
            data-test="sidebar-user-avatar"
            :avatar-id="user.avatarId"
            :nickname="user.nickname"
            :username="user.username"
            :size="32"
          />
        </button>
        <ThemeModeSwitch />
        <NButton
          data-test="admin-announcements"
          circle
          quaternary
          type="default"
          aria-label="通知公告"
          title="通知公告"
          @click="navigateToAnnouncements"
        >
          <template #icon>
            <span class="i-[lucide--megaphone] inline-block size-4" aria-hidden="true" />
          </template>
        </NButton>
        <NButton
          data-test="admin-logout"
          circle
          quaternary
          type="default"
          :loading="isLoggingOut"
          aria-label="退出登录"
          title="退出登录"
          @click="confirmLogout"
        >
          <template #icon>
            <span class="i-[lucide--log-out] inline-block size-4" aria-hidden="true" />
          </template>
        </NButton>
      </template>
      <template v-else>
        <div class="mb-4 flex items-center justify-between gap-2">
          <button
            v-if="user"
            data-test="admin-account-settings"
            type="button"
            class="-ml-2 flex min-w-0 flex-1 cursor-pointer items-center rounded-md border-0 bg-transparent px-2 py-2 text-left text-current transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-zinc-800"
            aria-label="个人设置"
            title="个人设置"
            @click="navigateToAccountSettings"
          >
            <UserAvatar
              data-test="sidebar-user-avatar"
              :avatar-id="user.avatarId"
              :nickname="user.nickname"
              :username="user.username"
              :size="40"
            />
            <div class="ml-2 min-w-0 flex-1 space-y-0.5">
              <p data-test="admin-sidebar-user" class="truncate text-sm font-medium">
                {{ user.nickname }}
              </p>
              <p class="truncate text-xs text-stone-500 dark:text-zinc-400">
                {{ user.username }}
              </p>
            </div>
          </button>
          <div class="flex shrink-0 items-center">
            <ThemeModeSwitch />
            <NButton
              data-test="admin-announcements"
              circle
              quaternary
              type="default"
              aria-label="通知公告"
              title="通知公告"
              @click="navigateToAnnouncements"
            >
              <template #icon>
                <span class="i-[lucide--megaphone] inline-block size-4" aria-hidden="true" />
              </template>
            </NButton>
          </div>
        </div>
        <NButton
          data-test="admin-logout"
          block
          strong
          tertiary
          type="default"
          :loading="isLoggingOut"
          @click="confirmLogout"
        >
          退出登录
        </NButton>
      </template>
    </div>
  </footer>
</template>
