<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { NAlert, NButton, NDrawer, NDrawerContent, NForm, NFormItem, NInput } from 'naive-ui'
import {
  customIconSetCreateSchema,
  customIconSetUpdateSchema,
  type CustomIconSet,
  type CustomIconSetCreateInput,
  type CustomIconSetUpdateInput,
} from '@rev30/contracts'
import { createCustomIconSet, updateCustomIconSet } from './requests'
import { getErrorMessage } from '../../utils/error'
import { ApiRequestError } from '../../utils/request'

const props = defineProps<{
  editingSet: CustomIconSet | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: [iconSet: CustomIconSet]
}>()

type IconSetFormField = 'prefix' | 'name' | 'description'

const form = reactive({
  prefix: '',
  name: '',
  description: '',
})

const fieldErrors = ref<Partial<Record<IconSetFormField, string>>>({})
const formError = ref<string | null>(null)
const isSaving = ref(false)
const drawerSessionId = ref(0)

const isEditing = computed(() => props.editingSet !== null)
const drawerTitle = computed(() => (isEditing.value ? '编辑图标集' : '新增图标集'))

function resetForm() {
  form.prefix = props.editingSet?.prefix ?? ''
  form.name = props.editingSet?.name ?? ''
  form.description = props.editingSet?.description ?? ''
  fieldErrors.value = {}
  formError.value = null
}

function setFieldError(field: IconSetFormField, message: string) {
  fieldErrors.value = {
    ...fieldErrors.value,
    [field]: message,
  }
}

function clearFieldError(field: IconSetFormField) {
  if (fieldErrors.value[field] === undefined) {
    return
  }

  fieldErrors.value = {
    ...fieldErrors.value,
    [field]: undefined,
  }
}

function applyValidationErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  fieldErrors.value = {}

  for (const issue of issues) {
    const field = issue.path[0]

    if (
      (field === 'prefix' || field === 'name' || field === 'description') &&
      fieldErrors.value[field] === undefined
    ) {
      setFieldError(field, issue.message)
    }
  }
}

function formItemValidationProps(message: string | undefined) {
  return message === undefined ? {} : { feedback: message, validationStatus: 'error' as const }
}

function getCurrentMode() {
  return props.editingSet === null ? 'create' : 'edit'
}

function getCurrentEditingPrefix() {
  return props.editingSet?.prefix ?? null
}

function isCurrentDrawerSession(sessionId: number, mode: 'create' | 'edit', prefix: string | null) {
  return (
    show.value &&
    drawerSessionId.value === sessionId &&
    getCurrentMode() === mode &&
    getCurrentEditingPrefix() === prefix
  )
}

function toCreateInput(): CustomIconSetCreateInput | null {
  const result = customIconSetCreateSchema.safeParse({
    prefix: form.prefix,
    name: form.name,
    description: form.description === '' ? null : form.description,
  })

  if (result.success) {
    return result.data
  }

  applyValidationErrors(result.error.issues)
  formError.value = result.error.issues[0]?.message ?? '表单校验失败'

  return null
}

function toUpdateInput(): CustomIconSetUpdateInput | null {
  const currentSet = props.editingSet

  if (currentSet === null) {
    return null
  }

  const nextName = form.name.trim()
  const nextDescription = form.description.trim()
  const input = {
    name: nextName === currentSet.name ? undefined : nextName,
    description:
      nextDescription === (currentSet.description ?? '') ? undefined : nextDescription || null,
  }
  const result = customIconSetUpdateSchema.safeParse(input)

  if (result.success) {
    return result.data
  }

  applyValidationErrors(result.error.issues)
  formError.value = result.error.issues[0]?.message ?? '表单校验失败'

  return null
}

async function handleSubmit() {
  if (isSaving.value) {
    return
  }

  fieldErrors.value = {}
  formError.value = null

  const input = isEditing.value ? toUpdateInput() : toCreateInput()

  if (input === null) {
    return
  }

  const sessionId = drawerSessionId.value
  const mode = getCurrentMode()
  const prefix = getCurrentEditingPrefix()

  isSaving.value = true

  try {
    const saved =
      mode === 'edit'
        ? await updateCustomIconSet(prefix!, input as CustomIconSetUpdateInput)
        : await createCustomIconSet(input as CustomIconSetCreateInput)

    if (!isCurrentDrawerSession(sessionId, mode, prefix)) {
      return
    }

    emit('saved', saved)
    show.value = false
  } catch (error) {
    if (!isCurrentDrawerSession(sessionId, mode, prefix)) {
      return
    }

    if (
      error instanceof ApiRequestError &&
      (error.field === 'prefix' || error.field === 'name' || error.field === 'description')
    ) {
      setFieldError(error.field, error.message)
    } else {
      formError.value = getErrorMessage(error, '保存图标集失败')
    }
  } finally {
    if (isCurrentDrawerSession(sessionId, mode, prefix)) {
      isSaving.value = false
    }
  }
}

watch(
  () => [show.value, getCurrentMode(), getCurrentEditingPrefix()] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    resetForm()
    isSaving.value = false
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
        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <NFormItem label="前缀" v-bind="formItemValidationProps(fieldErrors.prefix)">
            <NInput
              data-test="icon-set-form-prefix"
              :disabled="isSaving || isEditing"
              :value="form.prefix"
              placeholder="例如 acme"
              @update:value="
                (value) => {
                  clearFieldError('prefix')
                  form.prefix = value
                }
              "
            />
          </NFormItem>

          <NFormItem label="名称" v-bind="formItemValidationProps(fieldErrors.name)">
            <NInput
              data-test="icon-set-form-name"
              :disabled="isSaving"
              :value="form.name"
              placeholder="请输入图标集名称"
              @update:value="
                (value) => {
                  clearFieldError('name')
                  form.name = value
                }
              "
            />
          </NFormItem>

          <NFormItem label="描述" v-bind="formItemValidationProps(fieldErrors.description)">
            <NInput
              data-test="icon-set-form-description"
              :disabled="isSaving"
              :value="form.description"
              type="textarea"
              placeholder="选填"
              @update:value="
                (value) => {
                  clearFieldError('description')
                  form.description = value
                }
              "
            />
          </NFormItem>

          <div class="mt-6 flex justify-end">
            <NButton type="primary" :loading="isSaving" @click="handleSubmit">
              {{ isEditing ? '保存' : '创建' }}
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
