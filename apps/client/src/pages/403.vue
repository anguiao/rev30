<script setup lang="ts">
import { computed } from 'vue'
import { useMutation } from '@pinia/colada'
import { NButton } from 'naive-ui'
import { logout } from '../features/auth'
import ErrorPage from '../features/error/ErrorPage.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const logoutMutation = useMutation({
  mutation: () => logout(),
  onSettled() {
    auth.clearSession()
  },
})

const isLoggingOut = computed(() => logoutMutation.isLoading.value)

function handleLogout() {
  logoutMutation.mutate()
}
</script>

<template>
  <ErrorPage
    status="403"
    title="暂无可访问功能"
    description="当前账号还没有可进入的后台页面，请联系管理员分配权限。"
  >
    <template #footer>
      <NButton
        data-test="forbidden-logout"
        type="primary"
        :loading="isLoggingOut"
        @click="handleLogout"
      >
        退出登录
      </NButton>
    </template>
  </ErrorPage>
</template>
