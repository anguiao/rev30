<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { pick } from 'lodash-es'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
} from 'naive-ui'
import {
  CONFIG_STATUS_ENABLED,
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_STRING,
  configCreateSchema,
  configFormSchema,
  type ConfigFormInput,
  type ConfigValueType,
  configUpdateSchema,
} from '@rev30/shared'
import { SystemRequestError, createConfig, getConfig, getSystemErrorMessage, updateConfig } from '.'
import { configValueTypeSelectOptions, statusSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const props = defineProps<{
  configId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.configId === null ? '新增系统配置' : '编辑系统配置'))

const defaultFormValues: ConfigFormInput = {
  groupCode: '',
  key: '',
  name: '',
  valueType: CONFIG_VALUE_TYPE_STRING,
  value: '',
  description: null,
  status: CONFIG_STATUS_ENABLED,
  sortOrder: 0,
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'config-form', props.configId ?? 'create'],
  enabled: () => show.value,
  async query() {
    const configId = props.configId
    if (configId === null) {
      return { formValues: defaultFormValues }
    }

    const config = await getConfig(configId)

    return {
      formValues: pick(config, [
        'groupCode',
        'key',
        'name',
        'valueType',
        'value',
        'description',
        'status',
        'sortOrder',
      ]),
    }
  },
})

const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载系统配置信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: configFormSchema,
    onSubmit: configFormSchema,
  },
  onSubmit({ value }) {
    const configId = props.configId

    formError.value = null

    saveConfigMutation.mutate({ configId, value })
  },
})

const selectedValueType = form.useStore((state) => state.values.valueType)

const { isLoading: isSaving, ...saveConfigMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({ configId, value }: { configId: string | null; value: ConfigFormInput }) =>
    configId === null
      ? createConfig(configCreateSchema.parse(value))
      : updateConfig(configId, configUpdateSchema.parse(value)),
  onSuccess(_, { configId }, { sessionId }) {
    if (!show.value || props.configId !== configId || sessionId !== drawerSessionId.value) {
      return
    }

    if (configId !== null) {
      void queryCache.invalidateQueries({
        key: ['system', 'config-form', configId],
        exact: true,
      })
    }

    emit('saved')
    show.value = false
  },
  onError(error, { configId }, { sessionId }) {
    if (!show.value || props.configId !== configId || sessionId !== drawerSessionId.value) {
      return
    }

    if (
      error instanceof SystemRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getSystemErrorMessage(error, '保存系统配置失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

function toBooleanValue(value: string) {
  return value === 'true'
}

function toStringBoolean(value: boolean) {
  return value ? 'true' : 'false'
}

function handleValueTypeChange(
  valueType: ConfigValueType,
  onChange: (value: ConfigValueType) => void,
) {
  onChange(valueType)

  if (valueType === CONFIG_VALUE_TYPE_BOOLEAN) {
    const currentValue = form.getFieldValue('value')
    if (currentValue !== 'true' && currentValue !== 'false') {
      form.setFieldValue('value', 'false')
    }
  }
}

watch(
  () => [show.value, props.configId] as const,
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

    form.reset(formValues)
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <NDrawer v-model:show="show" placement="right" :width="640">
    <NDrawerContent :title="drawerTitle" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <form.Field name="groupCode" v-slot="{ field, state }">
            <NFormItem label="分组编码" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="config-form-group-code"
                :value="state.value"
                placeholder="请输入分组编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="key" v-slot="{ field, state }">
            <NFormItem label="配置键" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="config-form-key"
                :value="state.value"
                placeholder="请输入配置键"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem label="配置名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="config-form-name"
                :value="state.value"
                placeholder="请输入配置名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="valueType" v-slot="{ field, state }">
            <NFormItem label="值类型" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="config-form-value-type"
                :value="state.value"
                :options="configValueTypeSelectOptions"
                @update:value="(value) => handleValueTypeChange(value, field.handleChange)"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="value" v-slot="{ field, state }">
            <NFormItem label="配置值" v-bind="formItemValidationProps(state.meta)">
              <template v-if="selectedValueType === CONFIG_VALUE_TYPE_BOOLEAN">
                <NSwitch
                  data-test="config-form-value"
                  :value="toBooleanValue(state.value)"
                  @update:value="(value) => field.handleChange(toStringBoolean(value))"
                />
              </template>
              <template v-else-if="selectedValueType === CONFIG_VALUE_TYPE_JSON">
                <NInput
                  data-test="config-form-value"
                  type="textarea"
                  :value="state.value"
                  :autosize="{ minRows: 5, maxRows: 10 }"
                  placeholder="请输入配置值"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </template>
              <template v-else>
                <NInput
                  data-test="config-form-value"
                  :value="state.value"
                  placeholder="请输入配置值"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </template>
            </NFormItem>
          </form.Field>

          <form.Field name="description" v-slot="{ field, state }">
            <NFormItem label="配置说明" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="config-form-description"
                type="textarea"
                :value="state.value ?? ''"
                :autosize="{ minRows: 3, maxRows: 6 }"
                placeholder="可选"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="status" v-slot="{ field, state }">
            <NFormItem label="状态" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="config-form-status"
                :value="state.value"
                :options="statusSelectOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="sortOrder" v-slot="{ field, state }">
            <NFormItem label="排序" v-bind="formItemValidationProps(state.meta)">
              <NInputNumber
                data-test="config-form-sort-order"
                class="w-full"
                :value="state.value"
                :precision="0"
                :show-button="false"
                placeholder="请输入排序"
                @blur="field.handleBlur"
                @update:value="field.handleChange($event ?? 0)"
              />
            </NFormItem>
          </form.Field>

          <div class="flex justify-end gap-3">
            <NButton @click="show = false">取消</NButton>
            <NButton
              data-test="config-form-submit"
              type="primary"
              attr-type="submit"
              :disabled="isLoading || isSaving || !!loadError"
              :loading="isSaving"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
