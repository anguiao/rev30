<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import {
  NAlert,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NRadio,
  NRadioGroup,
  NSpace,
  NTag,
  NText,
} from 'naive-ui'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  configCustomValueSchema,
  configUpdateSchema,
  type ConfigUpdateInput,
} from '@rev30/contracts'
import { z } from 'zod'
import { getConfig, updateConfig } from '.'
import { configValueTypeLabels } from './labels'
import { getErrorMessage } from '../../utils/error'
import { ApiRequestError } from '../../utils/request'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const configFormSchema = z
  .object({
    valueSource: z.enum(['default', 'custom']),
    customValue: z.string(),
  })
  .refine(
    (value) =>
      value.valueSource === 'default' ||
      configCustomValueSchema.safeParse(value.customValue).success,
    {
      path: ['customValue'],
      message: '请输入自定义值',
    },
  )

type ConfigFormInput = z.input<typeof configFormSchema>
type ValueSource = ConfigFormInput['valueSource']

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const defaultFormValues: ConfigFormInput = {
  valueSource: 'default',
  customValue: '',
}

const props = defineProps<{
  configKey: string | null
}>()

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'config-form', props.configKey ?? 'none'],
  enabled: () => show.value && props.configKey !== null,
  async query() {
    const configKey = props.configKey
    if (configKey === null) {
      return null
    }

    const config = await getConfig(configKey)
    const valueSource: ValueSource = config.customValue === null ? 'default' : 'custom'

    return {
      config,
      formValues: {
        valueSource,
        customValue: config.customValue ?? '',
      },
    }
  },
})

const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载系统配置信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: configFormSchema,
    onSubmit: configFormSchema,
  },
  onSubmit({ value }) {
    const configKey = props.configKey
    if (configKey === null || isLoading.value || isSaving.value || loadError.value) {
      return
    }

    formError.value = null
    saveConfigMutation.mutate({
      configKey,
      input: {
        customValue: value.valueSource === 'custom' ? value.customValue : null,
      },
    })
  },
})

const showsCustomValue = form.useStore((state) => state.values.valueSource === 'custom')

const { isLoading: isSaving, ...saveConfigMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({ configKey, input }: { configKey: string; input: ConfigUpdateInput }) =>
    updateConfig(configKey, configUpdateSchema.parse(input)),
  onSuccess(_, { configKey }, { sessionId }) {
    if (!show.value || props.configKey !== configKey || sessionId !== drawerSessionId.value) {
      return
    }

    void queryCache.invalidateQueries({
      key: ['system', 'config-form', configKey],
      exact: true,
    })
    emit('saved')
    show.value = false
  },
  onError(error, { configKey }, { sessionId }) {
    if (!show.value || props.configKey !== configKey || sessionId !== drawerSessionId.value) {
      return
    }

    if (error instanceof ApiRequestError && setServerFieldError(form, error.field, error.message)) {
      return
    }

    formError.value = getErrorMessage(error, '保存系统配置失败')
  },
})

function handleValueSourceChange(nextSource: ValueSource) {
  form.setFieldValue('valueSource', nextSource)

  if (nextSource !== 'custom' || form.state.values.customValue.length > 0) {
    return
  }

  const configValue = formData.value?.config
  if (configValue !== undefined) {
    form.setFieldValue('customValue', configValue.customValue ?? configValue.defaultValue)
  }
}

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.configKey] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    saveConfigMutation.reset()
    formError.value = null
    form.reset(defaultFormValues)
  },
  {
    immediate: true,
  },
)

watch(
  () => [show.value, formData.value?.formValues] as const,
  ([isVisible, formValues]) => {
    if (!isVisible || formValues === undefined) {
      return
    }

    if (form.state.isDirty || !form.state.isDefaultValue) {
      return
    }

    form.reset(formValues)
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <NDrawer v-model:show="show" placement="right" :width="640">
    <NDrawerContent title="编辑系统配置" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <div
          v-if="formData"
          class="rounded-ui border border-stone-200 bg-stone-50/70 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="text-base font-medium text-stone-900 dark:text-zinc-100">
                {{ formData.config.name }}
              </div>
              <div class="mt-1 text-stone-500 dark:text-zinc-400">
                {{ formData.config.description }}
              </div>
            </div>

            <NSpace size="small" class="shrink-0">
              <NTag size="small" type="info" :bordered="false">
                {{ configValueTypeLabels[formData.config.valueType] }}
              </NTag>
              <NTag
                size="small"
                :type="formData.config.customValue === null ? 'default' : 'success'"
                :bordered="false"
              >
                {{ formData.config.customValue === null ? '默认值' : '自定义值' }}
              </NTag>
            </NSpace>
          </div>

          <NDescriptions
            class="mt-4 border-t border-stone-200 pt-3 dark:border-zinc-800"
            label-placement="top"
            :column="2"
            size="small"
          >
            <NDescriptionsItem label="配置键" :span="2">
              <NText code class="break-all">
                {{ formData.config.key }}
              </NText>
            </NDescriptionsItem>
            <NDescriptionsItem label="默认值">
              <NText code class="break-all">
                {{ formData.config.defaultValue }}
              </NText>
            </NDescriptionsItem>
            <NDescriptionsItem label="当前生效值">
              <NText code class="break-all">
                {{ formData.config.value }}
              </NText>
            </NDescriptionsItem>
          </NDescriptions>
        </div>

        <NForm @submit.prevent="handleSubmit">
          <form.Field name="valueSource" v-slot="{ state }">
            <NFormItem label="来源" v-bind="formItemValidationProps(state.meta)">
              <NRadioGroup
                data-test="config-form-value-source"
                :value="state.value"
                @update:value="handleValueSourceChange"
              >
                <div class="flex gap-4">
                  <NRadio value="default">默认值</NRadio>
                  <NRadio value="custom">自定义值</NRadio>
                </div>
              </NRadioGroup>
            </NFormItem>
          </form.Field>

          <form.Field name="customValue" v-slot="{ field, state }">
            <NFormItem
              v-if="formData"
              v-show="showsCustomValue"
              data-test="config-form-custom-value"
              label="自定义值"
              v-bind="formItemValidationProps(state.meta)"
            >
              <template v-if="formData.config.valueType === CONFIG_VALUE_TYPE_BOOLEAN">
                <NRadioGroup :value="state.value" @update:value="field.handleChange">
                  <div class="flex gap-4">
                    <NRadio value="true">true</NRadio>
                    <NRadio value="false">false</NRadio>
                  </div>
                </NRadioGroup>
              </template>
              <template v-else-if="formData.config.valueType === CONFIG_VALUE_TYPE_JSON">
                <NInput
                  type="textarea"
                  :value="state.value"
                  :autosize="{ minRows: 5, maxRows: 10 }"
                  placeholder="请输入自定义值"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </template>
              <template v-else>
                <NInput
                  :value="state.value"
                  placeholder="请输入自定义值"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </template>
            </NFormItem>
          </form.Field>
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton @click="show = false">取消</NButton>
          <NButton
            data-test="config-form-submit"
            attr-type="submit"
            type="primary"
            @click="handleSubmit"
            :disabled="isLoading || isSaving || !!loadError"
          >
            保存
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
