<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery } from '@pinia/colada'
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
  NTreeSelect,
} from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  resourceCreateSchema,
  resourceFormSchema,
  type ResourceFormInput,
  type ResourceType,
  resourceUpdateSchema,
} from '@rev30/shared'
import {
  SystemRequestError,
  createResource,
  getResource,
  getResourceTree,
  getSystemErrorMessage,
  updateResource,
} from '.'
import ResourceIconPicker from './ResourceIconPicker.vue'
import { resourceTypeLabels, statusSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { toTreeOptions } from '../../utils/ui'

const props = defineProps<{
  resourceId: string | null
  parentId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const resourceTypeOptions = [
  { label: resourceTypeLabels[RESOURCE_TYPE_DIRECTORY], value: RESOURCE_TYPE_DIRECTORY },
  { label: resourceTypeLabels[RESOURCE_TYPE_MENU], value: RESOURCE_TYPE_MENU },
  { label: resourceTypeLabels[RESOURCE_TYPE_EXTERNAL], value: RESOURCE_TYPE_EXTERNAL },
  { label: resourceTypeLabels[RESOURCE_TYPE_ACTION], value: RESOURCE_TYPE_ACTION },
]

const openTargetOptions = [
  { label: '当前窗口', value: RESOURCE_OPEN_TARGET_SELF },
  { label: '新窗口', value: RESOURCE_OPEN_TARGET_BLANK },
]

const drawerTitle = computed(() => (props.resourceId === null ? '新增资源' : '编辑资源'))

const defaultFormValues: ResourceFormInput = {
  type: RESOURCE_TYPE_DIRECTORY,
  name: '',
  code: '',
  parentId: null,
  path: null,
  externalUrl: null,
  openTarget: RESOURCE_OPEN_TARGET_SELF,
  icon: null,
  hidden: false,
  status: RESOURCE_STATUS_ENABLED,
  sortOrder: 0,
}

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => [
    'system',
    'resource-form',
    props.resourceId ?? 'create',
    props.resourceId === null ? (props.parentId ?? 'root') : 'edit',
  ],
  enabled: () => show.value,
  async query() {
    const resourceId = props.resourceId
    const parentId = props.parentId
    const [resources, resource] = await Promise.all([
      getResourceTree(),
      resourceId === null ? null : getResource(resourceId),
    ])

    return {
      resources,
      formValues:
        resource === null
          ? { ...defaultFormValues, parentId }
          : pick(resource, [
              'type',
              'name',
              'code',
              'parentId',
              'path',
              'externalUrl',
              'openTarget',
              'icon',
              'hidden',
              'status',
              'sortOrder',
            ]),
    }
  },
})
const resourceTreeOptions = computed(() => {
  const resourceId = props.resourceId

  return toTreeOptions(formData.value?.resources ?? [], {
    label: (resource) => `${resource.name} (${resource.code})`,
    ...(resourceId === null ? {} : { disabledSubtreeId: resourceId }),
  })
})
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载资源信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: { ...defaultFormValues, parentId: props.parentId },
  validators: {
    onChange: resourceFormSchema,
    onSubmit: resourceFormSchema,
  },
  onSubmit({ value }) {
    const resourceId = props.resourceId
    const parentId = props.parentId

    formError.value = null

    saveResourceMutation.mutate({ resourceId, parentId, value })
  },
})

const selectedResourceType = form.useStore((state) => state.values.type)
const showsPath = computed(() => selectedResourceType.value === RESOURCE_TYPE_MENU)
const showsExternalUrl = computed(() => selectedResourceType.value === RESOURCE_TYPE_EXTERNAL)
const showsOpenTarget = computed(
  () =>
    selectedResourceType.value === RESOURCE_TYPE_MENU ||
    selectedResourceType.value === RESOURCE_TYPE_EXTERNAL,
)

const { isLoading: isSaving, ...saveResourceMutation } = useMutation({
  mutation: ({
    resourceId,
    value,
  }: {
    resourceId: string | null
    parentId: string | null
    value: ResourceFormInput
  }) =>
    resourceId === null
      ? createResource(resourceCreateSchema.parse(value))
      : updateResource(resourceId, resourceUpdateSchema.parse(value)),
  onSuccess(_, { resourceId, parentId }) {
    if (!show.value || props.resourceId !== resourceId || props.parentId !== parentId) {
      return
    }

    emit('saved')
    show.value = false
  },
  onError(error, { resourceId, parentId }) {
    if (!show.value || props.resourceId !== resourceId || props.parentId !== parentId) {
      return
    }

    if (
      error instanceof SystemRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getSystemErrorMessage(error, '保存资源失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

function handleTypeChange(type: ResourceType, onChange: (value: ResourceType) => void) {
  onChange(type)

  if (type === RESOURCE_TYPE_EXTERNAL) {
    form.setFieldValue('path', null)
    form.setFieldValue('openTarget', RESOURCE_OPEN_TARGET_BLANK)
    return
  }

  if (type === RESOURCE_TYPE_MENU) {
    form.setFieldValue('externalUrl', null)
    form.setFieldValue('openTarget', RESOURCE_OPEN_TARGET_SELF)
    return
  }

  form.setFieldValue('path', null)
  form.setFieldValue('externalUrl', null)
  form.setFieldValue('openTarget', RESOURCE_OPEN_TARGET_SELF)
}

watch(
  () => [show.value, props.resourceId, props.parentId] as const,
  ([isVisible, , parentId]) => {
    if (!isVisible) {
      return
    }

    saveResourceMutation.reset()
    formError.value = null
    form.reset({ ...defaultFormValues, parentId })
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
          <form.Field name="type" v-slot="{ field, state }">
            <NFormItem label="资源类型" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="resource-form-type"
                :value="state.value"
                :options="resourceTypeOptions"
                @update:value="(value) => handleTypeChange(value, field.handleChange)"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem label="资源名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="resource-form-name"
                :value="state.value"
                placeholder="请输入资源名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="code" v-slot="{ field, state }">
            <NFormItem label="资源编码" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="resource-form-code"
                :value="state.value"
                placeholder="请输入资源编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="parentId" v-slot="{ field, state }">
            <NFormItem label="上级资源" v-bind="formItemValidationProps(state.meta)">
              <NTreeSelect
                data-test="resource-form-parent"
                clearable
                filterable
                default-expand-all
                :options="resourceTreeOptions"
                :value="state.value"
                placeholder="请选择上级资源"
                @update:value="(value) => field.handleChange(value === null ? null : String(value))"
              />
            </NFormItem>
          </form.Field>

          <form.Field v-if="showsPath" name="path" v-slot="{ field, state }">
            <NFormItem label="内部路径" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="resource-form-path"
                :value="state.value ?? ''"
                placeholder="例如 /system/resources"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field v-if="showsExternalUrl" name="externalUrl" v-slot="{ field, state }">
            <NFormItem label="外链地址" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="resource-form-external-url"
                :value="state.value ?? ''"
                placeholder="例如 https://example.com/docs"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field v-if="showsOpenTarget" name="openTarget" v-slot="{ field, state }">
            <NFormItem label="打开方式" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="resource-form-open-target"
                :value="state.value ?? null"
                :options="openTargetOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="icon" v-slot="{ field, state }">
            <NFormItem label="图标" v-bind="formItemValidationProps(state.meta)">
              <ResourceIconPicker
                :value="state.value ?? null"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form.Field name="hidden" v-slot="{ field, state }">
              <NFormItem label="隐藏" v-bind="formItemValidationProps(state.meta)">
                <NSwitch
                  data-test="resource-form-hidden"
                  :value="state.value"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>

            <form.Field name="status" v-slot="{ field, state }">
              <NFormItem label="状态" v-bind="formItemValidationProps(state.meta)">
                <NSelect
                  data-test="resource-form-status"
                  :value="state.value"
                  :options="statusSelectOptions"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>
          </div>

          <form.Field name="sortOrder" v-slot="{ field, state }">
            <NFormItem label="排序" v-bind="formItemValidationProps(state.meta)">
              <NInputNumber
                data-test="resource-form-sort-order"
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
              data-test="resource-form-submit"
              type="primary"
              attr-type="submit"
              :loading="isSaving"
              :disabled="isLoading || isSaving || !!loadError"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
