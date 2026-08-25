<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@pinia/colada'
import { OPERATION_LOG_RESULT_SUCCESS } from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import {
  NAlert,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui'
import {
  UserAgentSummary,
  clientIpSourceLabels,
  formatOperationLogTarget,
  getOperationLog,
  operationLogActionLabels,
  operationLogModuleLabels,
  operationLogResultLabels,
} from '.'
import { getErrorMessage } from '../../utils/error'

const props = defineProps<{
  operationLogId: string
}>()

const show = defineModel<boolean>('show', { required: true })
const message = useMessage()

async function copyId(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.success('已复制')
  } catch {
    message.error('复制失败')
  }
}

const {
  data: detail,
  error,
  isLoading,
} = useQuery({
  key: () => ['ops', 'operation-logs', 'detail', props.operationLogId],
  enabled: () => show.value,
  query: () => getOperationLog(props.operationLogId),
})
const visibleDetail = computed(() =>
  show.value && detail.value?.id === props.operationLogId ? detail.value : null,
)
const loadErrorMessage = computed(() =>
  error.value === null ? '' : getErrorMessage(error.value, '加载操作日志详情失败'),
)
</script>

<template>
  <NDrawer
    v-model:show="show"
    data-test="operation-log-detail-drawer"
    placement="right"
    :width="620"
  >
    <NDrawerContent title="操作日志详情" closable>
      <NSpin :show="isLoading">
        <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>
        <NDescriptions v-if="visibleDetail" bordered :column="1" label-placement="left">
          <NDescriptionsItem label="发生时间">{{
            formatDisplayDateTime(visibleDetail.createdAt)
          }}</NDescriptionsItem>
          <NDescriptionsItem label="操作者"
            >{{ visibleDetail.actorNickname }}（{{
              visibleDetail.actorUsername
            }}）</NDescriptionsItem
          >
          <NDescriptionsItem label="操作者 ID"
            ><span class="inline-flex max-w-full items-center gap-2 align-middle">
              <span class="min-w-0 break-all">{{ visibleDetail.actorUserId }}</span>
              <NButton
                quaternary
                circle
                type="primary"
                size="tiny"
                class="shrink-0"
                aria-label="复制操作者 ID"
                title="复制操作者 ID"
                data-test="operation-log-copy-id"
                @click="copyId(visibleDetail.actorUserId)"
              >
                <span class="i-[lucide--copy]" aria-hidden="true" />
              </NButton> </span
          ></NDescriptionsItem>
          <NDescriptionsItem label="管理员快照">{{
            visibleDetail.actorIsAdmin ? '管理员' : '非管理员'
          }}</NDescriptionsItem>
          <NDescriptionsItem label="结果"
            ><NTag
              :type="visibleDetail.result === OPERATION_LOG_RESULT_SUCCESS ? 'success' : 'error'"
              >{{ operationLogResultLabels[visibleDetail.result] }}</NTag
            ></NDescriptionsItem
          >
          <NDescriptionsItem label="模块 / 动作"
            >{{ operationLogModuleLabels[visibleDetail.module] }} ·
            {{ operationLogActionLabels[visibleDetail.action] }}</NDescriptionsItem
          >
          <NDescriptionsItem label="目标">{{
            formatOperationLogTarget(visibleDetail)
          }}</NDescriptionsItem>
          <NDescriptionsItem label="状态码">{{ visibleDetail.httpStatus }}</NDescriptionsItem>
          <NDescriptionsItem label="耗时">{{ visibleDetail.durationMs }} ms</NDescriptionsItem>
          <NDescriptionsItem label="请求 ID"
            ><span class="inline-flex max-w-full items-center gap-2 align-middle">
              <span class="min-w-0 break-all">{{ visibleDetail.requestId }}</span>
              <NButton
                quaternary
                circle
                type="primary"
                size="tiny"
                class="shrink-0"
                aria-label="复制请求 ID"
                title="复制请求 ID"
                data-test="operation-log-copy-id"
                @click="copyId(visibleDetail.requestId)"
              >
                <span class="i-[lucide--copy]" aria-hidden="true" />
              </NButton> </span
          ></NDescriptionsItem>
          <NDescriptionsItem label="会话 ID"
            ><span class="inline-flex max-w-full items-center gap-2 align-middle">
              <span class="min-w-0 break-all">{{ visibleDetail.actorSessionId }}</span>
              <NButton
                quaternary
                circle
                type="primary"
                size="tiny"
                class="shrink-0"
                aria-label="复制会话 ID"
                title="复制会话 ID"
                data-test="operation-log-copy-id"
                @click="copyId(visibleDetail.actorSessionId)"
              >
                <span class="i-[lucide--copy]" aria-hidden="true" />
              </NButton> </span
          ></NDescriptionsItem>
          <NDescriptionsItem label="客户端 IP"
            >{{ visibleDetail.clientIp ?? '-' }}（{{
              clientIpSourceLabels[visibleDetail.clientIpSource]
            }}）</NDescriptionsItem
          >
          <NDescriptionsItem label="设备"
            ><UserAgentSummary :user-agent="visibleDetail.userAgent"
          /></NDescriptionsItem>
        </NDescriptions>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
