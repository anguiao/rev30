<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItemGi,
  NGrid,
  NGridItem,
  NInput,
  NTag,
  useDialog,
  useMessage,
  type ButtonProps,
  type DataTableColumns,
} from 'naive-ui'
import type { ScheduledJobListItem, ScheduledJobTaskKey } from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { useDrawer } from '../../../composables/useDrawer'
import {
  cancelScheduledJob,
  executeScheduledJob,
  listScheduledJobs,
  scheduledJobRunStatusLabels,
  scheduledJobRunStatusTagTypes,
  updateScheduledJobEnabled,
} from '../../../features/ops'
import { getErrorMessage } from '../../../utils/error'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('定时任务')
const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

const keyword = ref('')
const submittedKeyword = ref('')

const {
  data: jobsResponse,
  error: jobsError,
  isLoading,
} = useQuery({
  key: () => ['ops', 'scheduled-jobs', 'list'],
  placeholderData: () => [],
  query: () => listScheduledJobs(),
})
const loadErrorMessage = computed(() =>
  jobsError.value === null ? '' : getErrorMessage(jobsError.value, '加载定时任务失败'),
)

async function invalidateScheduledJobListQueries() {
  await queryCache.invalidateQueries({ key: ['ops', 'scheduled-jobs', 'list'] })
}

async function handleSearch() {
  submittedKeyword.value = keyword.value.trim()
  await invalidateScheduledJobListQueries()
}

function handleReset() {
  keyword.value = ''
  submittedKeyword.value = ''
}

const jobsData = computed(() => jobsResponse.value ?? [])
const filteredJobs = computed(() => {
  const value = submittedKeyword.value.toLowerCase()
  if (!value) {
    return jobsData.value
  }

  return jobsData.value.filter((job) =>
    [job.taskKey, job.name, job.description].some((item) => item.toLowerCase().includes(value)),
  )
})

const pendingActions = ref(new Set<string>())

function getActionKey(taskKey: string, action: string) {
  return `${taskKey}:${action}`
}

function setActionPending(taskKey: string, action: string, pending: boolean) {
  const key = getActionKey(taskKey, action)
  const next = new Set(pendingActions.value)
  if (pending) {
    next.add(key)
  } else {
    next.delete(key)
  }
  pendingActions.value = next
}

function taskHasPendingAction(taskKey: string) {
  const prefix = `${taskKey}:`
  return [...pendingActions.value].some((key) => key.startsWith(prefix))
}

const {
  component: ScheduledJobFormDrawer,
  hasOpened: hasOpenedScheduledJobDrawer,
  visible: isScheduledJobDrawerVisible,
  open: showScheduledJobDrawer,
} = useDrawer(() => import('../../../features/ops/ScheduledJobFormDrawer.vue'))
const editingScheduledJobTaskKey = ref<ScheduledJobTaskKey | null>(null)

function openScheduledJobFormDrawer(taskKey: ScheduledJobTaskKey) {
  editingScheduledJobTaskKey.value = taskKey
  showScheduledJobDrawer()
}

async function handleScheduledJobSaved() {
  message.success('定时任务计划已保存')
  await invalidateScheduledJobListQueries()
}

const {
  component: ScheduledJobRunLogDrawer,
  hasOpened: hasOpenedRunLogDrawer,
  visible: isRunLogDrawerVisible,
  open: showRunLogDrawer,
} = useDrawer(() => import('../../../features/ops/ScheduledJobRunLogDrawer.vue'))
const runLogTask = ref<Pick<ScheduledJobListItem, 'taskKey' | 'name'> | null>(null)
const initialRunId = ref<string | null>(null)

function openRunLogs(job: ScheduledJobListItem, runId: string | null = null) {
  runLogTask.value = {
    taskKey: job.taskKey,
    name: job.name,
  }
  initialRunId.value = runId
  showRunLogDrawer()
}

const nextRunFormatters = new Map<string, Intl.DateTimeFormat>()

function formatNextRun(job: ScheduledJobListItem) {
  if (job.nextRunAt === null) {
    return '-'
  }

  let formatter = nextRunFormatters.get(job.timezone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: job.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    nextRunFormatters.set(job.timezone, formatter)
  }

  return formatter.format(new Date(job.nextRunAt))
}

function renderJobStatus(job: ScheduledJobListItem) {
  const currentRun = job.currentRun
  const tags = [
    h(
      NTag,
      {
        type: job.enabled ? 'success' : 'default',
        size: 'small',
        bordered: false,
      },
      () => (job.enabled ? '已启用' : '已禁用'),
    ),
  ]

  if (currentRun !== null) {
    tags.push(
      h(
        NTag,
        {
          type: currentRun.cancelRequestedAt === null ? 'info' : 'warning',
          size: 'small',
          bordered: false,
        },
        () => (currentRun.cancelRequestedAt === null ? '运行中' : '取消中'),
      ),
    )
  }

  return h('div', { class: 'flex flex-wrap items-center gap-1.5' }, tags)
}

function renderLastRun(job: ScheduledJobListItem) {
  const lastRun = job.lastRun
  if (lastRun === null) {
    return '-'
  }

  return h('div', { class: 'space-y-1' }, [
    h(
      NTag,
      {
        type: scheduledJobRunStatusTagTypes[lastRun.status],
        size: 'small',
        bordered: false,
      },
      () => scheduledJobRunStatusLabels[lastRun.status],
    ),
    h(
      'div',
      { class: 'text-xs text-stone-500 dark:text-zinc-400' },
      formatDisplayDateTime(lastRun.finishedAt),
    ),
  ])
}

async function toggleEnabled(job: ScheduledJobListItem) {
  const action = job.enabled ? 'disable' : 'enable'
  setActionPending(job.taskKey, action, true)

  try {
    await updateScheduledJobEnabled(job.taskKey, !job.enabled)
    message.success(job.enabled ? '定时任务已禁用' : '定时任务已启用')
    await invalidateScheduledJobListQueries()
  } catch (error) {
    message.error(getErrorMessage(error, job.enabled ? '禁用定时任务失败' : '启用定时任务失败'))
  } finally {
    setActionPending(job.taskKey, action, false)
  }
}

async function executeJob(job: ScheduledJobListItem) {
  setActionPending(job.taskKey, 'execute', true)

  try {
    const result = await executeScheduledJob(job.taskKey)
    if ('runId' in result) {
      message.success('定时任务已提交执行')
      openRunLogs(job, result.runId)
    } else {
      message.warning('任务已有运行中的实例，本次执行已跳过')
      openRunLogs(job, result.activeRunId)
    }
    await invalidateScheduledJobListQueries()
    return true
  } catch (error) {
    message.error(getErrorMessage(error, '提交定时任务失败'))
    return false
  } finally {
    setActionPending(job.taskKey, 'execute', false)
  }
}

function confirmExecute(job: ScheduledJobListItem) {
  if (job.currentRun !== null || taskHasPendingAction(job.taskKey)) {
    return
  }

  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'warning',
    'data-test': 'scheduled-job-execute-confirm',
  }
  dialog.warning({
    title: '确认立即执行',
    content: `确定立即执行“${job.name}”吗？任务会按当前业务保留规则执行清理，可能删除符合条件的数据。`,
    positiveText: '立即执行',
    negativeText: '取消',
    positiveButtonProps,
    onPositiveClick: () => executeJob(job),
  })
}

async function cancelJob(job: ScheduledJobListItem, runId: string) {
  setActionPending(job.taskKey, 'cancel', true)

  try {
    const result = await cancelScheduledJob(job.taskKey, runId)
    message.success('取消请求已提交')
    openRunLogs(job, result.run.id)
    await invalidateScheduledJobListQueries()
    return true
  } catch (error) {
    message.error(getErrorMessage(error, '取消定时任务失败'))
    return false
  } finally {
    setActionPending(job.taskKey, 'cancel', false)
  }
}

function confirmCancel(job: ScheduledJobListItem) {
  const currentRun = job.currentRun
  if (
    currentRun === null ||
    currentRun.cancelRequestedAt !== null ||
    taskHasPendingAction(job.taskKey)
  ) {
    return
  }

  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'warning',
    'data-test': 'scheduled-job-cancel-confirm',
  }
  dialog.warning({
    title: '确认取消运行',
    content: `确定请求取消“${job.name}”当前运行吗？任务会在下一个安全边界停止，已经开始的数据库或存储操作不会被强制中断。`,
    positiveText: '请求取消',
    negativeText: '返回',
    positiveButtonProps,
    onPositiveClick: () => cancelJob(job, currentRun.id),
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
    title: '计划',
    key: 'schedule',
    minWidth: 210,
    render: (job) =>
      h('div', { class: 'space-y-0.5' }, [
        h('div', { class: 'font-mono text-sm' }, job.cronExpression),
        h('div', { class: 'text-xs text-stone-500 dark:text-zinc-400' }, job.timezone),
      ]),
  },
  { title: '状态', key: 'status', minWidth: 150, render: renderJobStatus },
  {
    title: '下次执行',
    key: 'nextRunAt',
    minWidth: 210,
    render: (job) =>
      job.nextRunAt === null
        ? '-'
        : h('div', { class: 'space-y-0.5' }, [
            h('div', formatNextRun(job)),
            h('div', { class: 'text-xs text-stone-500 dark:text-zinc-400' }, job.timezone),
          ]),
  },
  { title: '最近运行', key: 'lastRun', minWidth: 150, render: renderLastRun },
  {
    title: '操作',
    key: 'actions',
    width: 220,
    fixed: 'right',
    render: (job) => {
      const actionDisabled = taskHasPendingAction(job.taskKey)
      return renderTableActions([
        renderTableActionButton({
          label: '查看日志',
          accessCode: 'ops:scheduled-job:list',
          dataTest: 'scheduled-job-logs',
          onClick: () => openRunLogs(job),
        }),
        renderTableActionButton({
          label: '编辑',
          accessCode: 'ops:scheduled-job:update',
          dataTest: 'scheduled-job-edit',
          disabled: actionDisabled,
          onClick: () => openScheduledJobFormDrawer(job.taskKey),
        }),
        renderTableActionButton({
          label: job.enabled ? '禁用' : '启用',
          accessCode: 'ops:scheduled-job:update',
          type: job.enabled ? 'warning' : 'success',
          dataTest: job.enabled ? 'scheduled-job-disable' : 'scheduled-job-enable',
          disabled: actionDisabled,
          onClick: () => void toggleEnabled(job),
        }),
        job.currentRun === null
          ? renderTableActionButton({
              label: '立即执行',
              accessCode: 'ops:scheduled-job:execute',
              type: 'warning',
              dataTest: 'scheduled-job-execute',
              disabled: actionDisabled,
              onClick: () => confirmExecute(job),
            })
          : job.currentRun.cancelRequestedAt === null
            ? renderTableActionButton({
                label: '取消',
                accessCode: 'ops:scheduled-job:cancel',
                type: 'warning',
                dataTest: 'scheduled-job-cancel',
                disabled: actionDisabled,
                onClick: () => confirmCancel(job),
              })
            : null,
      ])
    },
  },
]
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ filteredJobs.length }} 个</p>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm label-placement="left" :show-feedback="false">
        <NGrid cols="1 640:12 1024:24" item-responsive :x-gap="16" :y-gap="12">
          <NFormItemGi label="关键词" span="1 640:6 1024:6" class="min-w-0">
            <NInput
              v-model:value="keyword"
              data-test="scheduled-jobs-keyword"
              clearable
              placeholder="请输入关键词"
              class="w-full!"
            />
          </NFormItemGi>
          <NGridItem suffix span="1 640:6 1024:18">
            <div class="flex h-full items-center justify-end gap-2">
              <NButton data-test="scheduled-jobs-search" type="primary" @click="handleSearch">
                查询
              </NButton>
              <NButton data-test="scheduled-jobs-reset" @click="handleReset">重置</NButton>
            </div>
          </NGridItem>
        </NGrid>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="filteredJobs"
        :loading="isLoading"
        :pagination="false"
        :row-key="(job: ScheduledJobListItem) => job.taskKey"
        :scroll-x="1200"
      />
    </section>

    <ScheduledJobFormDrawer
      v-if="hasOpenedScheduledJobDrawer && editingScheduledJobTaskKey !== null"
      v-model:show="isScheduledJobDrawerVisible"
      :task-key="editingScheduledJobTaskKey"
      @saved="handleScheduledJobSaved"
    />
    <ScheduledJobRunLogDrawer
      v-if="hasOpenedRunLogDrawer && runLogTask !== null"
      v-model:show="isRunLogDrawerVisible"
      :task-key="runLogTask.taskKey"
      :task-name="runLogTask.name"
      :initial-run-id="initialRunId"
    />
  </main>
</template>
