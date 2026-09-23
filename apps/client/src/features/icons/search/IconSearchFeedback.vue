<script setup lang="ts">
import { computed } from 'vue'
import { NAlert, NButton } from 'naive-ui'
import { iconErrorCodeSchema } from '@rev30/contracts'
import { getErrorMessage } from '../../../utils/error'
import { ApiRequestError } from '../../../utils/request'

const props = defineProps<{
  error: Error | null
  loading: boolean
}>()
const emit = defineEmits<{ retry: [] }>()

const feedback = computed(() => {
  const error = props.error
  if (error === null) return null

  if (error instanceof ApiRequestError) {
    if (error.code === iconErrorCodeSchema.enum.ICON_SEARCH_PREPARING) {
      return { type: 'info' as const, message: '图标搜索正在准备', retryable: false }
    }
    if (error.code === iconErrorCodeSchema.enum.ICON_SEARCH_UNAVAILABLE) {
      return { type: 'warning' as const, message: '图标搜索暂不可用', retryable: true }
    }
  }

  return {
    type: 'error' as const,
    message: getErrorMessage(error, '图标搜索失败'),
    retryable: true,
  }
})
</script>

<template>
  <NAlert v-if="feedback" :type="feedback.type" :show-icon="false">
    {{ feedback.message }}
    <NButton
      v-if="feedback.retryable"
      size="small"
      text
      class="ml-2"
      :loading="loading"
      @click="emit('retry')"
    >
      重试
    </NButton>
  </NAlert>
</template>
