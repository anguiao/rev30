<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { NAlert, NButton, NDrawer, NDrawerContent, NForm, NFormItem, NInput } from 'naive-ui'
import {
  customIconSetCreateSchema,
  customIconSetFormSchema,
  customIconSetUpdateSchema,
  type CustomIconSetFormInput,
} from '@rev30/contracts'
import { createCustomIconSet, getCustomIconSet, updateCustomIconSet } from './requests'
import { getErrorMessage } from '../../utils/error'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { ApiRequestError } from '../../utils/request'

const props = defineProps<{
  prefix: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.prefix === null ? '创建图标集' : '编辑图标集'))

const defaultFormValues: CustomIconSetFormInput = {
  prefix: '',
  name: '',
  description: null,
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['content', 'icon-set-form', props.prefix ?? 'create'],
  enabled: () => show.value,
  async query() {
    const prefix = props.prefix

    if (prefix === null) {
      return {
        formValues: defaultFormValues,
      }
    }

    const iconSet = await getCustomIconSet(prefix)

    return {
      formValues: {
        prefix: iconSet.prefix,
        name: iconSet.name,
        description: iconSet.description,
      } satisfies CustomIconSetFormInput,
    }
  },
})
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载图标集信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: customIconSetFormSchema,
    onSubmit: customIconSetFormSchema,
  },
  onSubmit({ value }) {
    const prefix = props.prefix

    formError.value = null

    saveIconSetMutation.mutate({ prefix, value })
  },
})

const { isLoading: isSaving, ...saveIconSetMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({ prefix, value }: { prefix: string | null; value: CustomIconSetFormInput }) =>
    prefix === null
      ? createCustomIconSet(customIconSetCreateSchema.parse(value))
      : updateCustomIconSet(prefix, customIconSetUpdateSchema.parse(value)),
  onSuccess(_, { prefix }, { sessionId }) {
    if (!show.value || props.prefix !== prefix || sessionId !== drawerSessionId.value) {
      return
    }

    if (prefix !== null) {
      void queryCache.invalidateQueries({
        key: ['content', 'icon-set-form', prefix],
        exact: true,
      })
    }

    emit('saved')
    show.value = false
  },
  onError(error, { prefix }, { sessionId }) {
    if (!show.value || props.prefix !== prefix || sessionId !== drawerSessionId.value) {
      return
    }

    if (error instanceof ApiRequestError && setServerFieldError(form, error.field, error.message)) {
      return
    }

    formError.value = getErrorMessage(error, '保存图标集失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.prefix] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    saveIconSetMutation.reset()
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
  <NDrawer v-model:show="show" placement="right" :width="520">
    <NDrawerContent :title="drawerTitle" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <form.Field name="prefix" v-slot="{ field, state }">
            <NFormItem label="前缀" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="icon-set-form-prefix"
                :disabled="prefix !== null"
                :value="state.value"
                placeholder="例如 acme"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem label="名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="icon-set-form-name"
                :value="state.value"
                placeholder="请输入图标集名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="description" v-slot="{ field, state }">
            <NFormItem label="描述" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="icon-set-form-description"
                :value="state.value"
                type="textarea"
                placeholder="选填"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton data-test="icon-set-form-cancel" @click="show = false"> 取消 </NButton>
          <NButton
            data-test="icon-set-form-submit"
            type="primary"
            :disabled="isLoading || isSaving || loadError !== null"
            :loading="isSaving"
            @click="handleSubmit"
          >
            保存
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
