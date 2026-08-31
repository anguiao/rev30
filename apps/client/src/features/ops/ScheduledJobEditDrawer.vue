<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation } from '@pinia/colada'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  useMessage,
} from 'naive-ui'
import type { ScheduledJobListItem } from '@rev30/contracts'
import { getNextCronOccurrences, parseCronSchedule } from '@rev30/utils'
import { updateScheduledJob } from './requests'
import { useDrawerUnsavedChangesGuard } from '../../composables/useDrawerUnsavedChangesGuard'
import { getErrorMessage } from '../../utils/error'

const props = defineProps<{
  job: ScheduledJobListItem | null
}>()

const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ saved: [] }>()
const message = useMessage()

const cronExpression = ref('')
const timezone = ref('Asia/Shanghai')
const formError = ref<string | null>(null)
const drawerSessionId = ref(0)

const timezoneOptions = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])].map(
  (value) => ({
    label: value,
    value,
  }),
)

const preview = computed(() => {
  try {
    const from = new Date()
    const schedule = parseCronSchedule(
      {
        expression: cronExpression.value,
        timezone: timezone.value,
      },
      from,
    )
    return {
      schedule,
      occurrences: getNextCronOccurrences(schedule, from, 5),
      error: null,
    }
  } catch (error) {
    return {
      schedule: null,
      occurrences: [],
      error: getErrorMessage(error, 'Cron 表达式或时区无效'),
    }
  }
})

function formatPreviewDateTime(value: Date) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone.value,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  })
  const parts = formatter.formatToParts(value)
  const date = parts
    .filter(({ type }) => ['year', 'month', 'day'].includes(type))
    .map(({ value: part }) => part)
    .join('/')
  const time = parts
    .filter(({ type }) => ['hour', 'minute', 'second'].includes(type))
    .map(({ value: part }) => part)
    .join(':')
  const offset = parts.find(({ type }) => type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const explicitOffset = offset === 'GMT' ? 'GMT+00:00' : offset

  return `${date} ${time} ${timezone.value}（${explicitOffset}）`
}

const { isLoading: isSaving, ...saveScheduledJobMutation } = useMutation({
  onMutate() {
    return { sessionId: drawerSessionId.value }
  },
  mutation: ({
    taskKey,
    cronExpression,
    timezone,
  }: {
    taskKey: ScheduledJobListItem['taskKey']
    cronExpression: string
    timezone: string
  }) => updateScheduledJob(taskKey, { cronExpression, timezone }),
  onSuccess(_, { taskKey }, { sessionId }) {
    if (!show.value || props.job?.taskKey !== taskKey || sessionId !== drawerSessionId.value) {
      return
    }

    message.success('定时任务计划已保存')
    emit('saved')
    show.value = false
  },
  onError(error, { taskKey }, { sessionId }) {
    if (!show.value || props.job?.taskKey !== taskKey || sessionId !== drawerSessionId.value) {
      return
    }

    formError.value = getErrorMessage(error, '保存定时任务计划失败')
  },
})

watch(
  () => [show.value, props.job] as const,
  ([visible, job]) => {
    if (!visible || job === null) {
      return
    }

    drawerSessionId.value += 1
    saveScheduledJobMutation.reset()
    cronExpression.value = job.cronExpression
    timezone.value = job.timezone
    formError.value = null
  },
  { immediate: true },
)

function handleSave() {
  if (props.job === null || preview.value.schedule === null || isSaving.value) {
    return
  }

  formError.value = null
  saveScheduledJobMutation.mutate({
    taskKey: props.job.taskKey,
    cronExpression: preview.value.schedule.expression,
    timezone: preview.value.schedule.timezone,
  })
}

const isFormDirty = computed(
  () =>
    props.job !== null &&
    (cronExpression.value !== props.job.cronExpression || timezone.value !== props.job.timezone),
)
const { requestClose, handleDrawerShowUpdate } = useDrawerUnsavedChangesGuard({
  show,
  isDirty: isFormDirty,
})
</script>

<template>
  <NDrawer
    :show="show"
    data-test="scheduled-job-edit-drawer"
    placement="right"
    width="min(560px, 100vw)"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="handleDrawerShowUpdate"
  >
    <NDrawerContent v-if="job" title="编辑定时任务" closable>
      <div class="space-y-4">
        <p data-test="scheduled-job-edit-context" class="text-sm text-stone-500 dark:text-zinc-400">
          当前任务：<span class="font-medium text-stone-700 dark:text-zinc-200">{{
            job.name
          }}</span>
        </p>

        <NAlert type="info" :show-icon="false">
          仅支持标准五段 Cron（分、时、日、月、周）。不支持秒、年份、@daily、L、W、# 等扩展语法。
          修改计划或禁用不会影响当前运行；重新启用不会补跑禁用期间的计划。
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">{{ formError }}</NAlert>

        <NForm label-placement="top">
          <NFormItem label="Cron 表达式">
            <NInput
              v-model:value="cronExpression"
              data-test="scheduled-job-cron-input"
              placeholder="例如 2 */6 * * *"
            />
          </NFormItem>
          <NFormItem label="IANA 时区">
            <NSelect
              v-model:value="timezone"
              data-test="scheduled-job-timezone-select"
              filterable
              :options="timezoneOptions"
              placeholder="请选择时区"
            />
          </NFormItem>
        </NForm>

        <section>
          <h2 class="mb-2 text-sm font-medium">未来五次执行预览</h2>
          <NAlert v-if="preview.error" type="error" :show-icon="false">
            {{ preview.error }}
          </NAlert>
          <ol v-else class="list-decimal space-y-1 pl-5 text-sm">
            <li v-for="occurrence in preview.occurrences" :key="occurrence.toISOString()">
              {{ formatPreviewDateTime(occurrence) }}
            </li>
          </ol>
        </section>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton data-test="scheduled-job-edit-cancel" @click="requestClose">取消</NButton>
          <NButton
            data-test="scheduled-job-save"
            type="primary"
            :loading="isSaving"
            :disabled="preview.schedule === null || isSaving"
            @click="handleSave"
          >
            保存
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
