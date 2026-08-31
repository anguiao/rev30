<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NSelect,
} from 'naive-ui'
import {
  scheduledJobPlanUpdateInputSchema,
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobTaskKey,
} from '@rev30/contracts'
import { getNextCronOccurrences } from '@rev30/utils'
import { getScheduledJob, updateScheduledJob } from '.'
import { useDrawerUnsavedChangesGuard } from '../../composables/useDrawerUnsavedChangesGuard'
import { getErrorMessage } from '../../utils/error'
import { formItemValidationProps } from '../../utils/form'

const props = defineProps<{
  taskKey: ScheduledJobTaskKey
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const defaultFormValues: ScheduledJobPlanUpdateInput = {
  cronExpression: '',
  timezone: 'Asia/Shanghai',
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['ops', 'scheduled-job-form', props.taskKey],
  enabled: () => show.value,
  async query() {
    const job = await getScheduledJob(props.taskKey)
    return {
      job,
      formValues: {
        cronExpression: job.cronExpression,
        timezone: job.timezone,
      },
    }
  },
})
const timezoneOptions = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])].map(
  (value) => ({
    label: value,
    value,
  }),
)
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载定时任务信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: scheduledJobPlanUpdateInputSchema,
    onSubmit: scheduledJobPlanUpdateInputSchema,
  },
  onSubmit({ value }) {
    if (
      formData.value === undefined ||
      schedulePreview.value.error !== null ||
      isLoading.value ||
      isSaving.value ||
      loadError.value !== null
    ) {
      return
    }

    formError.value = null
    saveScheduledJobMutation.mutate({
      taskKey: props.taskKey,
      value,
    })
  },
})

const cronExpression = form.useSelector((state) => state.values.cronExpression)
const timezone = form.useSelector((state) => state.values.timezone)

const schedulePreview = computed(() => {
  try {
    return {
      occurrences: getNextCronOccurrences(
        {
          expression: cronExpression.value,
          timezone: timezone.value,
        },
        new Date(),
        5,
      ),
      error: null,
    }
  } catch (error) {
    return {
      occurrences: [],
      error: getErrorMessage(error, 'Cron 表达式或时区无效'),
    }
  }
})

const previewDateTimeFormatter = computed(
  () =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone.value,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    }),
)

function formatPreviewDateTime(value: Date) {
  const parts = Object.fromEntries(
    previewDateTimeFormatter.value.formatToParts(value).map((part) => [part.type, part.value]),
  )
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${timezone.value} (${parts.timeZoneName})`
}

const { isLoading: isSaving, ...saveScheduledJobMutation } = useMutation({
  onMutate() {
    return { sessionId: drawerSessionId.value }
  },
  mutation: ({
    taskKey,
    value,
  }: {
    taskKey: ScheduledJobTaskKey
    value: ScheduledJobPlanUpdateInput
  }) => updateScheduledJob(taskKey, value),
  onSuccess(_, { taskKey }, { sessionId }) {
    if (!show.value || props.taskKey !== taskKey || sessionId !== drawerSessionId.value) {
      return
    }

    void queryCache.invalidateQueries({
      key: ['ops', 'scheduled-job-form', taskKey],
      exact: true,
    })
    emit('saved')
    show.value = false
  },
  onError(error, { taskKey }, { sessionId }) {
    if (!show.value || props.taskKey !== taskKey || sessionId !== drawerSessionId.value) {
      return
    }

    formError.value = getErrorMessage(error, '保存定时任务计划失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value !== null) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.taskKey] as const,
  ([visible]) => {
    if (!visible) {
      return
    }

    drawerSessionId.value += 1
    saveScheduledJobMutation.reset()
    formError.value = null
    form.reset(defaultFormValues)
  },
  { immediate: true },
)

watch(
  () => [show.value, formData.value?.formValues] as const,
  ([visible, formValues]) => {
    if (!visible || formValues === undefined) {
      return
    }

    if (form.state.isDirty || !form.state.isDefaultValue) {
      return
    }

    form.reset(formValues)
  },
  { immediate: true },
)

const isFormDirty = form.useSelector((state) => !state.isDefaultValue)
const { requestClose, handleDrawerShowUpdate } = useDrawerUnsavedChangesGuard({
  show,
  isDirty: isFormDirty,
})
</script>

<template>
  <NDrawer
    :show="show"
    data-test="scheduled-job-form-drawer"
    placement="right"
    :width="640"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="handleDrawerShowUpdate"
  >
    <NDrawerContent title="编辑定时任务" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">{{ loadError }}</NAlert>
        <NAlert v-if="formError" type="error" :show-icon="false">{{ formError }}</NAlert>

        <template v-if="formData">
          <p
            data-test="scheduled-job-form-context"
            class="text-sm text-stone-500 dark:text-zinc-400"
          >
            当前任务：<span class="font-medium text-stone-700 dark:text-zinc-200">{{
              formData.job.name
            }}</span>
          </p>

          <NAlert type="info" :show-icon="false">
            Cron
            表达式按分钟级解析；保存前请确认未来五次执行时间符合预期。修改计划或禁用不会影响当前运行；重新启用不会补跑禁用期间的计划。
          </NAlert>

          <NForm @submit.prevent="handleSubmit">
            <form.Field name="cronExpression" v-slot="{ field, state }">
              <NFormItem label="Cron 表达式" v-bind="formItemValidationProps(state.meta)">
                <NInput
                  data-test="scheduled-job-form-cron-expression"
                  :value="state.value"
                  placeholder="例如 2 */6 * * *"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>

            <form.Field name="timezone" v-slot="{ field, state }">
              <NFormItem label="IANA 时区" v-bind="formItemValidationProps(state.meta)">
                <NSelect
                  data-test="scheduled-job-form-timezone"
                  filterable
                  :value="state.value"
                  :options="timezoneOptions"
                  placeholder="请选择时区"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>
          </NForm>

          <section>
            <h2 class="mb-2 text-sm font-medium">未来五次执行预览</h2>
            <NAlert v-if="schedulePreview.error" type="error" :show-icon="false">
              {{ schedulePreview.error }}
            </NAlert>
            <ol v-else class="list-decimal space-y-1 pl-5 text-sm">
              <li v-for="occurrence in schedulePreview.occurrences" :key="occurrence.toISOString()">
                {{ formatPreviewDateTime(occurrence) }}
              </li>
            </ol>
          </section>
        </template>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton data-test="scheduled-job-form-cancel" @click="requestClose">取消</NButton>
          <NButton
            data-test="scheduled-job-form-submit"
            type="primary"
            :loading="isSaving"
            :disabled="
              formData === undefined ||
              isLoading ||
              loadError !== null ||
              schedulePreview.error !== null ||
              isSaving
            "
            @click="handleSubmit"
          >
            保存
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
