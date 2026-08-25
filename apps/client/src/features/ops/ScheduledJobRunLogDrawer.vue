<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
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
  ScheduledJobRunDetail,
  ScheduledJobRunListItem,
  ScheduledJobRunListResponse,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { getScheduledJobRun, listScheduledJobRuns } from './requests'
import {
  scheduledJobErrorCategoryLabels,
  scheduledJobRunStatusLabels,
  scheduledJobSkipReasonLabels,
  scheduledJobTriggerSourceLabels,
} from './labels'
import { getErrorMessage } from '../../utils/error'

const props = defineProps<{
  job: ScheduledJobListItem | null
  focusRunId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })
const page = ref(1)
const pageSize = 10
const response = ref<ScheduledJobRunListResponse | null>(null)
const listError = ref<string | null>(null)
const isLoadingList = ref(false)
const selectedRunId = ref<string | null>(null)
const detail = ref<ScheduledJobRunDetail | null>(null)
const detailError = ref<string | null>(null)
const isLoadingDetail = ref(false)
let detailController: AbortController | null = null
let listController: AbortController | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let loadGeneration = 0

const visibleDetail = computed(() =>
  show.value && detail.value?.id === selectedRunId.value ? detail.value : null,
)

function clearPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function abortDetailRequest() {
  detailController?.abort()
  detailController = null
}

function abortListRequest() {
  listController?.abort()
  listController = null
}

function clearDetailMonitoring() {
  clearPolling()
  abortDetailRequest()
  detail.value = null
  detailError.value = null
  isLoadingDetail.value = false
}

async function loadList() {
  const taskKey = props.job?.taskKey
  if (!show.value || taskKey === undefined) {
    return
  }

  const generation = ++loadGeneration
  abortListRequest()
  const controller = new AbortController()
  listController = controller
  isLoadingList.value = true
  listError.value = null

  try {
    const nextResponse = await listScheduledJobRuns(
      taskKey,
      { page: page.value, pageSize },
      { signal: controller.signal },
    )
    if (!controller.signal.aborted && show.value && generation === loadGeneration) {
      response.value = nextResponse
    }
  } catch (error) {
    if (!controller.signal.aborted && show.value && generation === loadGeneration) {
      listError.value = getErrorMessage(error, '加载任务运行日志失败')
    }
  } finally {
    if (listController === controller) {
      listController = null
    }
    if (!controller.signal.aborted && generation === loadGeneration) {
      isLoadingList.value = false
    }
  }
}

async function loadDetail(runId: string) {
  const taskKey = props.job?.taskKey
  if (!show.value || taskKey === undefined || selectedRunId.value !== runId) {
    return
  }

  clearPolling()
  abortDetailRequest()
  const controller = new AbortController()
  detailController = controller
  isLoadingDetail.value = true
  detailError.value = null

  try {
    const nextDetail = await getScheduledJobRun(taskKey, runId, { signal: controller.signal })
    if (!controller.signal.aborted && show.value && selectedRunId.value === runId) {
      detail.value = nextDetail
      if (nextDetail.status === 'running') {
        pollTimer = setTimeout(() => void loadDetail(runId), 2000)
      }
    }
  } catch (error) {
    if (!controller.signal.aborted && show.value && selectedRunId.value === runId) {
      detailError.value = getErrorMessage(error, '加载任务运行详情失败')
    }
  } finally {
    if (detailController === controller) {
      detailController = null
      isLoadingDetail.value = false
    }
  }
}

function selectRun(runId: string) {
  selectedRunId.value = runId
  clearDetailMonitoring()
  void loadDetail(runId)
}

function closeDrawer() {
  show.value = false
  loadGeneration += 1
  abortListRequest()
  isLoadingList.value = false
  clearDetailMonitoring()
}

watch(
  () => [show.value, props.job?.taskKey, props.focusRunId] as const,
  ([visible, taskKey, focusRunId]) => {
    if (!visible || taskKey === undefined) {
      closeDrawer()
      return
    }

    const pageChanged = page.value !== 1
    page.value = 1
    response.value = null
    selectedRunId.value = focusRunId
    abortListRequest()
    isLoadingList.value = false
    clearDetailMonitoring()
    if (!pageChanged) {
      void loadList()
    }
    if (focusRunId !== null) {
      void loadDetail(focusRunId)
    }
  },
  { immediate: true },
)

watch(page, () => {
  if (show.value) {
    void loadList()
  }
})

onBeforeUnmount(() => {
  loadGeneration += 1
  abortListRequest()
  clearDetailMonitoring()
})

function formatRunDate(value: string | null) {
  return value === null ? '-' : formatDisplayDateTime(value)
}

function renderStatus(status: ScheduledJobRunListItem['status']) {
  const type =
    status === 'success'
      ? 'success'
      : status === 'failure' || status === 'interrupted'
        ? 'error'
        : status === 'running'
          ? 'info'
          : 'warning'
  return h(NTag, { type, size: 'small' }, () => scheduledJobRunStatusLabels[status])
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
      h(
        NButton,
        {
          text: true,
          type: 'primary',
          size: 'small',
          'data-test': 'scheduled-job-run-view',
          onClick: () => selectRun(item.id),
        },
        () => '详情',
      ),
  },
]
</script>

<template>
  <NDrawer
    v-model:show="show"
    placement="right"
    :width="920"
    @update:show="(value) => !value && closeDrawer()"
  >
    <NDrawerContent v-if="job" :title="`运行日志：${job.name}`" closable>
      <div class="space-y-5">
        <NAlert v-if="listError" type="error">{{ listError }}</NAlert>
        <NDataTable
          :columns="columns"
          :data="response?.list ?? []"
          :loading="isLoadingList"
          :pagination="false"
          :row-key="(item: ScheduledJobRunListItem) => item.id"
          :scroll-x="1050"
        />
        <div class="flex justify-end">
          <NPagination
            v-model:page="page"
            :page-size="pageSize"
            :item-count="response?.total ?? 0"
          />
        </div>

        <section v-if="selectedRunId" class="border-t border-stone-200 pt-4 dark:border-zinc-800">
          <h2 class="mb-3 text-base font-medium">运行详情</h2>
          <NSpin :show="isLoadingDetail">
            <NAlert v-if="detailError" type="error">{{ detailError }}</NAlert>
            <NDescriptions v-if="visibleDetail" bordered :column="1" label-placement="left">
              <NDescriptionsItem label="运行 ID">{{ visibleDetail.id }}</NDescriptionsItem>
              <NDescriptionsItem label="任务键">{{ visibleDetail.taskKey }}</NDescriptionsItem>
              <NDescriptionsItem label="状态">{{
                scheduledJobRunStatusLabels[visibleDetail.status]
              }}</NDescriptionsItem>
              <NDescriptionsItem label="触发来源">{{
                scheduledJobTriggerSourceLabels[visibleDetail.triggerSource]
              }}</NDescriptionsItem>
              <NDescriptionsItem label="计划时间">{{
                formatRunDate(visibleDetail.scheduledFor)
              }}</NDescriptionsItem>
              <NDescriptionsItem label="创建时间">{{
                formatRunDate(visibleDetail.createdAt)
              }}</NDescriptionsItem>
              <NDescriptionsItem label="开始时间">{{
                formatRunDate(visibleDetail.startedAt)
              }}</NDescriptionsItem>
              <NDescriptionsItem label="取消请求">{{
                formatRunDate(visibleDetail.cancelRequestedAt)
              }}</NDescriptionsItem>
              <NDescriptionsItem label="结束时间">{{
                formatRunDate(visibleDetail.finishedAt)
              }}</NDescriptionsItem>
              <NDescriptionsItem label="耗时">{{
                visibleDetail.durationMs === null ? '未知' : `${visibleDetail.durationMs} ms`
              }}</NDescriptionsItem>
              <NDescriptionsItem label="执行器 ID">{{
                visibleDetail.executorId ?? '-'
              }}</NDescriptionsItem>
              <NDescriptionsItem label="删除计数">{{
                visibleDetail.deletedCount ?? '-'
              }}</NDescriptionsItem>
              <NDescriptionsItem label="失败计数">{{
                visibleDetail.failedCount ?? '-'
              }}</NDescriptionsItem>
              <NDescriptionsItem v-if="visibleDetail.skipReason" label="跳过原因">{{
                scheduledJobSkipReasonLabels[visibleDetail.skipReason]
              }}</NDescriptionsItem>
              <NDescriptionsItem v-if="visibleDetail.errorCategory" label="错误分类">{{
                scheduledJobErrorCategoryLabels[visibleDetail.errorCategory]
              }}</NDescriptionsItem>
              <NDescriptionsItem v-if="visibleDetail.errorSummary" label="错误摘要">{{
                visibleDetail.errorSummary
              }}</NDescriptionsItem>
              <NDescriptionsItem v-if="visibleDetail.triggeredByUserId" label="手动触发人">
                {{ visibleDetail.triggeredByNickname }}（{{
                  visibleDetail.triggeredByUsername
                }}）<br />
                {{ visibleDetail.triggeredByUserId }}<br />
                会话：{{ visibleDetail.triggeredBySessionId }}<br />
                请求：{{ visibleDetail.triggerRequestId }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="visibleDetail.cancelRequestedByUserId" label="取消操作者">
                {{ visibleDetail.cancelRequestedByNickname }}（{{
                  visibleDetail.cancelRequestedByUsername
                }}）<br />
                {{ visibleDetail.cancelRequestedByUserId }}<br />
                会话：{{ visibleDetail.cancelRequestedBySessionId }}<br />
                请求：{{ visibleDetail.cancelRequestId }}
              </NDescriptionsItem>
            </NDescriptions>
          </NSpin>
        </section>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
