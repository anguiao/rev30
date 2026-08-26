<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NPagination,
  NSpin,
  NTag,
} from 'naive-ui'
import type {
  ScheduledJobListItem,
  ScheduledJobRunListItem,
  ScheduledJobRunListResponse,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { getScheduledJobRun, listScheduledJobRuns } from './requests'
import {
  scheduledJobErrorCategoryLabels,
  scheduledJobRunStatusLabels,
  scheduledJobRunStatusTagTypes,
  scheduledJobSkipReasonLabels,
  scheduledJobTriggerSourceLabels,
} from './labels'
import { getErrorMessage } from '../../utils/error'
import { renderTableActionButton, renderTableActions } from '../../utils/ui'

const props = defineProps<{
  job: ScheduledJobListItem | null
  focusRunId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ runSettled: [runId: string] }>()
const queryCache = useQueryCache()

const page = ref(1)
const pageSize = 10
const view = ref<'detail' | 'list'>('list')
const selectedRunId = ref<string | null>(null)
const settledRunIds = new Set<string>()
const observedRunningRunIds = new Set<string>()
let pollTimer: ReturnType<typeof setTimeout> | null = null

const taskKey = computed(() => props.job?.taskKey ?? null)

function clearPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function cancelRunQueries(currentTaskKey: ScheduledJobListItem['taskKey'] | null) {
  if (currentTaskKey === null) {
    return
  }

  queryCache.cancelQueries({
    key: ['ops', 'scheduled-jobs', 'runs', currentTaskKey],
  })
}

watch(
  () => [show.value, taskKey.value, props.focusRunId] as const,
  ([visible, nextTaskKey, focusRunId], previousValues) => {
    const previousTaskKey = previousValues?.[1] ?? null
    clearPolling()

    if (previousTaskKey !== null && previousTaskKey !== nextTaskKey) {
      cancelRunQueries(previousTaskKey)
    }

    if (!visible || nextTaskKey === null) {
      cancelRunQueries(nextTaskKey ?? previousTaskKey)
      page.value = 1
      selectedRunId.value = null
      view.value = 'list'
      return
    }

    page.value = 1
    selectedRunId.value = focusRunId
    view.value = focusRunId === null ? 'list' : 'detail'
  },
  { immediate: true, flush: 'sync' },
)

const emptyRunList: ScheduledJobRunListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize,
}

const {
  data: runsResponse,
  error: runsError,
  isLoading: isLoadingList,
  refetch: refetchRunList,
} = useQuery<ScheduledJobRunListResponse>({
  key: () => [
    'ops',
    'scheduled-jobs',
    'runs',
    taskKey.value ?? 'none',
    'list',
    page.value,
    pageSize,
  ],
  enabled: () => show.value && taskKey.value !== null,
  staleTime: 0,
  placeholderData: (previousData, previousEntry) =>
    previousEntry?.key?.[3] === taskKey.value ? (previousData ?? emptyRunList) : emptyRunList,
  query: ({ signal }) => {
    const currentTaskKey = taskKey.value
    if (currentTaskKey === null) {
      throw new Error('定时任务不存在')
    }

    return listScheduledJobRuns(currentTaskKey, { page: page.value, pageSize }, { signal })
  },
})
const runsData = computed(() => runsResponse.value ?? emptyRunList)
const listErrorMessage = computed(() =>
  runsError.value === null ? '' : getErrorMessage(runsError.value, '加载任务运行日志失败'),
)

const {
  data: detail,
  error: detailError,
  asyncStatus: detailAsyncStatus,
  isLoading: isLoadingDetail,
  refetch: refetchRunDetail,
} = useQuery({
  key: () => [
    'ops',
    'scheduled-jobs',
    'runs',
    taskKey.value ?? 'none',
    'detail',
    selectedRunId.value ?? 'none',
  ],
  enabled: () =>
    show.value && taskKey.value !== null && view.value === 'detail' && selectedRunId.value !== null,
  staleTime: 0,
  query: ({ signal }) => {
    const currentTaskKey = taskKey.value
    const runId = selectedRunId.value
    if (currentTaskKey === null || runId === null) {
      throw new Error('任务运行不存在')
    }

    return getScheduledJobRun(currentTaskKey, runId, { signal })
  },
})
const visibleDetail = computed(() =>
  show.value && detail.value?.id === selectedRunId.value ? detail.value : null,
)
const detailErrorMessage = computed(() =>
  detailError.value === null ? '' : getErrorMessage(detailError.value, '加载任务运行详情失败'),
)

function notifyRunSettled(runId: string) {
  if (settledRunIds.has(runId)) {
    return
  }

  settledRunIds.add(runId)
  observedRunningRunIds.delete(runId)
  emit('runSettled', runId)
  void refetchRunList()
}

watch(
  () =>
    [
      show.value,
      view.value,
      selectedRunId.value,
      visibleDetail.value,
      detailAsyncStatus.value,
      detailError.value,
    ] as const,
  ([visible, currentView, runId, nextDetail, asyncStatus, error]) => {
    clearPolling()
    if (
      !visible ||
      currentView !== 'detail' ||
      runId === null ||
      nextDetail === null ||
      asyncStatus !== 'idle' ||
      error !== null
    ) {
      return
    }

    if (nextDetail.status === 'running') {
      observedRunningRunIds.add(runId)
      pollTimer = setTimeout(() => {
        pollTimer = null
        void refetchRunDetail()
      }, 2000)
      return
    }

    const listedStatus = runsData.value.list.find((item) => item.id === runId)?.status ?? null
    if (
      props.focusRunId === runId ||
      observedRunningRunIds.has(runId) ||
      listedStatus === 'running'
    ) {
      notifyRunSettled(runId)
    }
  },
  { flush: 'post' },
)

function selectRun(runId: string) {
  clearPolling()
  selectedRunId.value = runId
  view.value = 'detail'
}

function showRunList() {
  const currentTaskKey = taskKey.value
  const runId = selectedRunId.value
  clearPolling()
  if (currentTaskKey !== null && runId !== null) {
    queryCache.cancelQueries({
      key: ['ops', 'scheduled-jobs', 'runs', currentTaskKey, 'detail', runId],
      exact: true,
    })
  }
  selectedRunId.value = null
  view.value = 'list'
}

function retryDetail() {
  if (selectedRunId.value !== null) {
    void refetchRunDetail()
  }
}

function closeDrawer() {
  show.value = false
}

function handleDrawerShowUpdate(nextShow: boolean) {
  if (!nextShow) {
    closeDrawer()
  }
}

onBeforeUnmount(() => {
  clearPolling()
  cancelRunQueries(taskKey.value)
})

function formatRunDate(value: string | null) {
  return value === null ? '-' : formatDisplayDateTime(value)
}

function renderStatus(status: ScheduledJobRunListItem['status']) {
  return h(
    NTag,
    { type: scheduledJobRunStatusTagTypes[status], size: 'small', bordered: false },
    () => scheduledJobRunStatusLabels[status],
  )
}

const columns: DataTableColumns<ScheduledJobRunListItem> = [
  { title: '状态', key: 'status', width: 90, render: (item) => renderStatus(item.status) },
  {
    title: '来源',
    key: 'triggerSource',
    width: 80,
    render: (item) => scheduledJobTriggerSourceLabels[item.triggerSource],
  },
  {
    title: '计划时间',
    key: 'scheduledFor',
    minWidth: 170,
    render: (item) => formatRunDate(item.scheduledFor),
  },
  {
    title: '开始',
    key: 'startedAt',
    minWidth: 170,
    render: (item) => formatRunDate(item.startedAt),
  },
  {
    title: '结束',
    key: 'finishedAt',
    minWidth: 170,
    render: (item) => formatRunDate(item.finishedAt),
  },
  {
    title: '耗时',
    key: 'durationMs',
    width: 100,
    render: (item) => (item.durationMs === null ? '未知' : `${item.durationMs} ms`),
  },
  {
    title: '计数',
    key: 'counts',
    width: 120,
    render: (item) =>
      item.deletedCount === null ? '-' : `删除 ${item.deletedCount} · 失败 ${item.failedCount}`,
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render: (item) =>
      renderTableActions([
        renderTableActionButton({
          label: '详情',
          accessCode: 'ops:scheduled-job:list',
          dataTest: 'scheduled-job-run-view',
          onClick: () => selectRun(item.id),
        }),
      ]),
  },
]
</script>

<template>
  <NDrawer
    :show="show"
    data-test="scheduled-job-run-log-drawer"
    placement="right"
    width="min(920px, 100vw)"
    @update:show="handleDrawerShowUpdate"
  >
    <NDrawerContent v-if="job" title="定时任务日志" closable>
      <p
        data-test="scheduled-job-run-context"
        class="mb-4 text-sm text-stone-500 dark:text-zinc-400"
      >
        当前任务：<span class="font-medium text-stone-700 dark:text-zinc-200">{{ job.name }}</span>
      </p>

      <div v-if="view === 'list'" class="space-y-5">
        <NAlert v-if="listErrorMessage" type="error">{{ listErrorMessage }}</NAlert>
        <NDataTable
          :columns="columns"
          :data="runsData.list"
          :loading="isLoadingList"
          :pagination="false"
          :row-key="(item: ScheduledJobRunListItem) => item.id"
          :scroll-x="1050"
        />
        <div class="flex justify-end">
          <NPagination v-model:page="page" :page-size="pageSize" :item-count="runsData.total" />
        </div>
      </div>

      <div v-else>
        <NButton text type="primary" data-test="scheduled-job-run-back" @click="showRunList">
          <span class="mr-1 i-[lucide--arrow-left]" aria-hidden="true" />
          返回列表
        </NButton>

        <div class="mt-1">
          <NSpin :show="isLoadingDetail">
            <div class="min-h-24">
              <div v-if="detailErrorMessage" class="space-y-3">
                <NAlert type="error">{{ detailErrorMessage }}</NAlert>
                <NButton size="small" @click="retryDetail">重试</NButton>
              </div>

              <NDescriptions v-if="visibleDetail" bordered :column="1" label-placement="left">
                <NDescriptionsItem label="运行 ID">
                  <span class="font-mono text-xs break-all">{{ visibleDetail.id }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem label="任务键">{{ visibleDetail.taskKey }}</NDescriptionsItem>
                <NDescriptionsItem label="状态">
                  <NTag
                    :type="scheduledJobRunStatusTagTypes[visibleDetail.status]"
                    :bordered="false"
                  >
                    {{ scheduledJobRunStatusLabels[visibleDetail.status] }}
                  </NTag>
                </NDescriptionsItem>
                <NDescriptionsItem label="触发来源">
                  {{ scheduledJobTriggerSourceLabels[visibleDetail.triggerSource] }}
                </NDescriptionsItem>
                <NDescriptionsItem label="计划时间">
                  {{ formatRunDate(visibleDetail.scheduledFor) }}
                </NDescriptionsItem>
                <NDescriptionsItem label="创建时间">
                  {{ formatRunDate(visibleDetail.createdAt) }}
                </NDescriptionsItem>
                <NDescriptionsItem label="开始时间">
                  {{ formatRunDate(visibleDetail.startedAt) }}
                </NDescriptionsItem>
                <NDescriptionsItem label="取消请求">
                  {{ formatRunDate(visibleDetail.cancelRequestedAt) }}
                </NDescriptionsItem>
                <NDescriptionsItem label="结束时间">
                  {{ formatRunDate(visibleDetail.finishedAt) }}
                </NDescriptionsItem>
                <NDescriptionsItem label="耗时">
                  {{
                    visibleDetail.durationMs === null ? '未知' : `${visibleDetail.durationMs} ms`
                  }}
                </NDescriptionsItem>
                <NDescriptionsItem label="执行器 ID">
                  <span class="font-mono text-xs break-all">{{
                    visibleDetail.executorId ?? '-'
                  }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem label="删除计数">
                  {{ visibleDetail.deletedCount ?? '-' }}
                </NDescriptionsItem>
                <NDescriptionsItem label="失败计数">
                  {{ visibleDetail.failedCount ?? '-' }}
                </NDescriptionsItem>
                <NDescriptionsItem v-if="visibleDetail.skipReason" label="跳过原因">
                  {{ scheduledJobSkipReasonLabels[visibleDetail.skipReason] }}
                </NDescriptionsItem>
                <NDescriptionsItem v-if="visibleDetail.errorCategory" label="错误分类">
                  {{ scheduledJobErrorCategoryLabels[visibleDetail.errorCategory] }}
                </NDescriptionsItem>
                <NDescriptionsItem v-if="visibleDetail.errorSummary" label="错误摘要">
                  <span class="break-words">{{ visibleDetail.errorSummary }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem v-if="visibleDetail.triggeredByUserId" label="手动触发人">
                  {{ visibleDetail.triggeredByNickname }}（{{
                    visibleDetail.triggeredByUsername
                  }}）<br />
                  <span class="font-mono text-xs break-all">{{
                    visibleDetail.triggeredByUserId
                  }}</span
                  ><br />
                  会话：<span class="font-mono text-xs break-all">{{
                    visibleDetail.triggeredBySessionId
                  }}</span
                  ><br />
                  请求：<span class="font-mono text-xs break-all">{{
                    visibleDetail.triggerRequestId
                  }}</span>
                </NDescriptionsItem>
                <NDescriptionsItem v-if="visibleDetail.cancelRequestedByUserId" label="取消操作者">
                  {{ visibleDetail.cancelRequestedByNickname }}（{{
                    visibleDetail.cancelRequestedByUsername
                  }}）<br />
                  <span class="font-mono text-xs break-all">{{
                    visibleDetail.cancelRequestedByUserId
                  }}</span
                  ><br />
                  会话：<span class="font-mono text-xs break-all">{{
                    visibleDetail.cancelRequestedBySessionId
                  }}</span
                  ><br />
                  请求：<span class="font-mono text-xs break-all">{{
                    visibleDetail.cancelRequestId
                  }}</span>
                </NDescriptionsItem>
              </NDescriptions>
            </div>
          </NSpin>
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
