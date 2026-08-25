<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import { getNextCronOccurrences, validateCronSchedule } from '@rev30/utils'
import { updateScheduledJob } from './requests'
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
const isSaving = ref(false)

const timezoneOptions = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])].map(
  (value) => ({
    label: value,
    value,
  }),
)

const preview = computed(() => {
  try {
    const schedule = validateCronSchedule({
      expression: cronExpression.value,
      timezone: timezone.value,
    })
    return {
      schedule,
      occurrences: getNextCronOccurrences({ ...schedule, from: new Date(), count: 5 }),
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

watch(
  () => [show.value, props.job] as const,
  ([visible, job]) => {
    if (!visible || job === null) {
      return
    }

    cronExpression.value = job.cronExpression
    timezone.value = job.timezone
    formError.value = null
  },
  { immediate: true },
)

async function handleSave() {
  if (props.job === null || preview.value.schedule === null || isSaving.value) {
    return
  }

  formError.value = null
  isSaving.value = true

  try {
    await updateScheduledJob(props.job.taskKey, {
      cronExpression: preview.value.schedule.expression,
      timezone: preview.value.schedule.timezone,
    })
    message.success('定时任务计划已保存')
    emit('saved')
    show.value = false
  } catch (error) {
    formError.value = getErrorMessage(error, '保存定时任务计划失败')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <NDrawer v-model:show="show" placement="right" :width="560" :mask-closable="false">
    <NDrawerContent v-if="job" :title="`编辑：${job.name}`" closable>
      <div class="space-y-4">
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
          <NButton @click="show = false">取消</NButton>
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
