<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NDataTable,
  NTag,
  useDialog,
  useMessage,
  type ButtonProps,
  type DataTableColumns,
} from 'naive-ui'
import type { ScheduledJobListItem } from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { ScheduledJobEditDrawer, ScheduledJobRunLogDrawer } from '../../../features/ops'
import {
  cancelScheduledJob,
  executeScheduledJob,
  listScheduledJobs,
  scheduledJobRunStatusLabels,
  updateScheduledJobEnabled,
} from '../../../features/ops'
import { getErrorMessage } from '../../../utils/error'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('定时任务')
const message = useMessage()
const dialog = useDialog()
const jobs = ref<ScheduledJobListItem[]>([])
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const pendingAction = ref<string | null>(null)
const selectedJob = ref<ScheduledJobListItem | null>(null)
const isEditDrawerVisible = ref(false)
const isRunLogDrawerVisible = ref(false)
const focusedRunId = ref<string | null>(null)
let loadGeneration = 0

async function refreshJobs() {
  const generation = ++loadGeneration
  isLoading.value = true
  loadError.value = null

  try {
    const response = await listScheduledJobs()
    if (generation === loadGeneration) {
      jobs.value = response
    }
  } catch (error) {
    if (generation === loadGeneration) {
      loadError.value = getErrorMessage(error, '加载定时任务失败')
    }
  } finally {
    if (generation === loadGeneration) {
      isLoading.value = false
    }
  }
}

onMounted(() => {
  void refreshJobs()
})

function formatNextRun(job: ScheduledJobListItem) {
  return job.nextRunAt === null
    ? '已禁用'
    : `${formatDisplayDateTime(job.nextRunAt)}（${job.timezone}）`
}

function renderCurrentRun(job: ScheduledJobListItem) {
  if (job.currentRun === null) {
    return '-'
  }

  if (job.currentRun.cancelRequestedAt !== null) {
    return h(NTag, { type: 'warning', size: 'small' }, () => '取消中')
  }

  return h(NTag, { type: 'info', size: 'small' }, () => '运行中')
}

function renderLastRun(job: ScheduledJobListItem) {
  if (job.lastRun === null) {
    return '-'
  }

  return h('div', { class: 'space-y-0.5' }, [
    h('div', scheduledJobRunStatusLabels[job.lastRun.status]),
    h(
      'div',
      { class: 'text-xs text-stone-500 dark:text-zinc-400' },
      formatDisplayDateTime(job.lastRun.finishedAt),
    ),
  ])
}

function actionIsPending(taskKey: string, action: string) {
  return pendingAction.value === `${taskKey}:${action}`
}

function openEditor(job: ScheduledJobListItem) {
  selectedJob.value = job
  isEditDrawerVisible.value = true
}

function openRunLogs(job: ScheduledJobListItem, runId: string | null = null) {
  selectedJob.value = job
  focusedRunId.value = runId
  isRunLogDrawerVisible.value = true
}

async function toggleEnabled(job: ScheduledJobListItem) {
  const action = job.enabled ? 'disable' : 'enable'
  pendingAction.value = `${job.taskKey}:${action}`

  try {
    await updateScheduledJobEnabled(job.taskKey, !job.enabled)
    message.success(job.enabled ? '定时任务已禁用' : '定时任务已启用')
    await refreshJobs()
  } catch (error) {
    message.error(getErrorMessage(error, job.enabled ? '禁用定时任务失败' : '启用定时任务失败'))
  } finally {
    pendingAction.value = null
  }
}

async function executeJob(job: ScheduledJobListItem) {
  pendingAction.value = `${job.taskKey}:execute`

  try {
    const result = await executeScheduledJob(job.taskKey)
    if ('runId' in result) {
      message.success('定时任务已提交执行')
      openRunLogs(job, result.runId)
    } else {
      message.warning(`任务已有运行中的实例（${result.activeRunId}），本次执行已跳过`)
    }
    await refreshJobs()
  } catch (error) {
    message.error(getErrorMessage(error, '提交定时任务失败'))
  } finally {
    pendingAction.value = null
  }
}

function confirmCancel(job: ScheduledJobListItem) {
  const currentRun = job.currentRun
  if (currentRun === null) {
    return
  }

  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'warning',
    'data-test': 'scheduled-job-cancel-confirm',
  }
  dialog.warning({
    title: '确认取消运行',
    content: `确定请求取消“${job.name}”当前运行吗？handler 会在安全边界退出。`,
    positiveText: '请求取消',
    negativeText: '返回',
    positiveButtonProps,
    async onPositiveClick() {
      pendingAction.value = `${job.taskKey}:cancel`
      try {
        const result = await cancelScheduledJob(job.taskKey, currentRun.id)
        message.success('取消请求已提交')
        openRunLogs(job, result.run.id)
        await refreshJobs()
      } catch (error) {
        message.error(getErrorMessage(error, '取消定时任务失败'))
        return false
      } finally {
        pendingAction.value = null
      }
    },
  })
}

const columns: DataTableColumns<ScheduledJobListItem> = [
  {
    title: '任务',
    key: 'task',
    minWidth: 260,
    render: (job) =>
      h('div', { class: 'space-y-0.5' }, [
        h('div', { class: 'font-medium' }, job.name),
        h('div', { class: 'font-mono text-xs text-stone-500 dark:text-zinc-400' }, job.taskKey),
        h('div', { class: 'text-xs text-stone-500 dark:text-zinc-400' }, job.description),
      ]),
  },
  {
    title: 'Cron / 时区',
    key: 'schedule',
    minWidth: 210,
    render: (job) =>
      h('div', { class: 'space-y-0.5' }, [
        h('div', { class: 'font-mono text-sm' }, job.cronExpression),
        h('div', { class: 'text-xs text-stone-500 dark:text-zinc-400' }, job.timezone),
      ]),
  },
  {
    title: '启用 / 下次执行',
    key: 'nextRunAt',
    minWidth: 220,
    render: (job) =>
      h('div', { class: 'space-y-1' }, [
        h(NTag, { type: job.enabled ? 'success' : 'default', size: 'small' }, () =>
          job.enabled ? '已启用' : '已禁用',
        ),
        h('div', { class: 'text-sm' }, formatNextRun(job)),
      ]),
  },
  { title: '当前状态', key: 'currentRun', minWidth: 110, render: renderCurrentRun },
  { title: '最近终态', key: 'lastRun', minWidth: 150, render: renderLastRun },
  {
    title: '操作',
    key: 'actions',
    minWidth: 300,
    fixed: 'right',
    render: (job) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: 'ops:scheduled-job:update',
          dataTest: 'scheduled-job-edit',
          disabled: actionIsPending(job.taskKey, 'update'),
          onClick: () => openEditor(job),
        }),
        renderTableActionButton({
          label: job.enabled ? '禁用' : '启用',
          accessCode: 'ops:scheduled-job:update',
          type: job.enabled ? 'warning' : 'success',
          dataTest: job.enabled ? 'scheduled-job-disable' : 'scheduled-job-enable',
          disabled: actionIsPending(job.taskKey, job.enabled ? 'disable' : 'enable'),
          onClick: () => void toggleEnabled(job),
        }),
        renderTableActionButton({
          label: '立即执行',
          accessCode: 'ops:scheduled-job:execute',
          dataTest: 'scheduled-job-execute',
          disabled: actionIsPending(job.taskKey, 'execute'),
          onClick: () => void executeJob(job),
        }),
        job.currentRun === null
          ? null
          : renderTableActionButton({
              label: '取消',
              accessCode: 'ops:scheduled-job:cancel',
              type: 'warning',
              dataTest: 'scheduled-job-cancel',
              disabled: actionIsPending(job.taskKey, 'cancel'),
              onClick: () => confirmCancel(job),
            }),
        renderTableActionButton({
          label: '查看日志',
          accessCode: 'ops:scheduled-job:list',
          dataTest: 'scheduled-job-logs',
          onClick: () => openRunLogs(job),
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          共 {{ jobs.length }} 个固定任务
        </p>
      </div>
      <NButton data-test="scheduled-jobs-refresh" :loading="isLoading" @click="refreshJobs">
        刷新
      </NButton>
    </header>

    <NAlert v-if="loadError" type="error">{{ loadError }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="jobs"
        :loading="isLoading"
        :pagination="false"
        :row-key="(job: ScheduledJobListItem) => job.taskKey"
        :scroll-x="1250"
      />
    </section>

    <ScheduledJobEditDrawer
      v-if="selectedJob !== null"
      v-model:show="isEditDrawerVisible"
      :job="selectedJob"
      @saved="refreshJobs"
    />
    <ScheduledJobRunLogDrawer
      v-if="selectedJob !== null"
      v-model:show="isRunLogDrawerVisible"
      :job="selectedJob"
      :focus-run-id="focusedRunId"
    />
  </main>
</template>
