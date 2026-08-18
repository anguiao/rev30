<script setup lang="ts">
import { computed } from 'vue'
import type { OpsUserAgent } from '@rev30/contracts'
import { opsDeviceTypeLabels } from './labels'

const props = defineProps<{
  userAgent: OpsUserAgent
}>()

function formatProduct(product: NonNullable<OpsUserAgent>['browser']) {
  if (product === null) {
    return null
  }

  return product.version === null ? product.name : `${product.name} ${product.version}`
}

const summary = computed(() => {
  if (props.userAgent === null) {
    return '未知设备'
  }

  const parts = [
    formatProduct(props.userAgent.browser),
    formatProduct(props.userAgent.operatingSystem),
    props.userAgent.deviceType === 'unknown'
      ? null
      : opsDeviceTypeLabels[props.userAgent.deviceType],
  ].filter((part): part is string => part !== null)

  return parts.length === 0 ? '未知设备' : parts.join(' · ')
})
</script>

<template>
  <span :title="userAgent?.raw">{{ summary }}</span>
</template>
