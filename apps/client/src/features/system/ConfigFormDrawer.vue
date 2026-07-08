<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NRadio,
  NRadioGroup,
} from 'naive-ui'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  configUpdateSchema,
  type Config,
  type ConfigUpdateInput,
} from '@rev30/contracts'
import { getConfig, updateConfig } from '.'
import { configValueTypeLabels } from './labels'
import { getErrorMessage } from '../../utils/error'
import { ApiRequestError } from '../../utils/request'

type ValueMode = 'default' | 'custom'

const props = defineProps<{
  configKey: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const queryCache = useQueryCache()
const drawerSessionId = ref(0)
const valueMode = ref<ValueMode>('default')
const customValue = ref('')
const customValueError = ref<string | null>(null)
const formError = ref<string | null>(null)

const {
  data: configData,
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

    return getConfig(configKey)
  },
})

const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载系统配置信息失败'),
)
const config = computed(() => configData.value)
const usesBooleanValue = computed(() => config.value?.valueType === CONFIG_VALUE_TYPE_BOOLEAN)
const usesJsonValue = computed(() => config.value?.valueType === CONFIG_VALUE_TYPE_JSON)

function ensureCustomDraft(configValue: Config) {
  if (customValue.value.length > 0) {
    return
  }

  customValue.value = configValue.customValue ?? configValue.defaultValue
}

function resetFormState() {
  valueMode.value = 'default'
  customValue.value = ''
  customValueError.value = null
  formError.value = null
}

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

    if (error instanceof ApiRequestError && error.field === 'customValue') {
      customValueError.value = error.message
      return
    }

    formError.value = getErrorMessage(error, '保存系统配置失败')
  },
})

function handleValueModeChange(nextMode: ValueMode) {
  valueMode.value = nextMode
  customValueError.value = null

  if (nextMode === 'custom' && config.value !== null && config.value !== undefined) {
    ensureCustomDraft(config.value)
  }
}

function handleCustomValueChange(value: string) {
  customValue.value = value
  customValueError.value = null
}

function handleSubmit() {
  const configKey = props.configKey
  if (configKey === null || isLoading.value || isSaving.value || loadError.value) {
    return
  }

  formError.value = null
  customValueError.value = null
  saveConfigMutation.mutate({
    configKey,
    input: {
      customValue: valueMode.value === 'custom' ? customValue.value : null,
    },
  })
}

watch(
  () => [show.value, props.configKey] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    saveConfigMutation.reset()
    resetFormState()
  },
  {
    immediate: true,
  },
)

watch(
  () => [show.value, config.value] as const,
  ([isVisible, configValue]) => {
    if (!isVisible || configValue === null || configValue === undefined) {
      return
    }

    valueMode.value = configValue.customValue === null ? 'default' : 'custom'
    customValue.value = configValue.customValue ?? ''
    customValueError.value = null
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

        <div v-if="config" class="flex flex-col gap-2 text-sm">
          <div>配置键：{{ config.key }}</div>
          <div class="text-base font-medium">{{ config.name }}</div>
          <div class="text-stone-500 dark:text-zinc-400">{{ config.description }}</div>
          <div>值类型：{{ configValueTypeLabels[config.valueType] }}</div>
          <div>默认值：{{ config.defaultValue }}</div>
          <div>当前生效值：{{ config.value }}</div>
        </div>

        <NForm @submit.prevent="handleSubmit">
          <NFormItem label="生效方式">
            <NRadioGroup
              data-test="config-form-value-mode"
              :value="valueMode"
              @update:value="handleValueModeChange"
            >
              <div class="flex gap-4">
                <NRadio value="default">默认值</NRadio>
                <NRadio value="custom">自定义值</NRadio>
              </div>
            </NRadioGroup>
          </NFormItem>

          <NFormItem
            v-if="config"
            v-show="valueMode === 'custom'"
            data-test="config-form-custom-value"
            label="自定义值"
            v-bind="
              customValueError ? { feedback: customValueError, validationStatus: 'error' } : {}
            "
          >
            <template v-if="usesBooleanValue">
              <NRadioGroup :value="customValue" @update:value="handleCustomValueChange">
                <div class="flex gap-4">
                  <NRadio value="true">true</NRadio>
                  <NRadio value="false">false</NRadio>
                </div>
              </NRadioGroup>
            </template>
            <template v-else-if="usesJsonValue">
              <NInput
                type="textarea"
                :value="customValue"
                :autosize="{ minRows: 5, maxRows: 10 }"
                placeholder="请输入自定义值"
                @update:value="handleCustomValueChange"
              />
            </template>
            <template v-else>
              <NInput
                :value="customValue"
                placeholder="请输入自定义值"
                @update:value="handleCustomValueChange"
              />
            </template>
          </NFormItem>
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
