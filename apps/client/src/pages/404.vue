<script setup lang="ts">
import { NButton } from 'naive-ui'
import { useRouter } from 'vue-router'
import ErrorPage from '../features/error/ErrorPage.vue'

const router = useRouter()

async function returnHome() {
  await router.push('/')
}
</script>

<template>
  <ErrorPage status="404" title="页面不存在" description="你访问的页面不存在，请检查地址后重试。">
    <template #footer>
      <NButton type="primary" @click="returnHome">返回首页</NButton>
    </template>
  </ErrorPage>
</template>
