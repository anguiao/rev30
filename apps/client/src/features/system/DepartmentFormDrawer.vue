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
  NTreeSelect,
} from 'naive-ui'
import {
  DEPARTMENT_STATUS_ENABLED,
  departmentCreateSchema,
  departmentFormSchema,
  type DepartmentFormInput,
  departmentUpdateSchema,
} from '@rev30/shared'
import {
  SystemRequestError,
  createDepartment,
  getDepartment,
  getDepartmentTree,
  getSystemErrorMessage,
  updateDepartment,
} from '.'
import { statusSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { toTreeOptions } from '../../utils/ui'

const props = defineProps<{
  departmentId: string | null
  parentId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.departmentId === null ? '新增部门' : '编辑部门'))

const defaultFormValues: DepartmentFormInput = {
  name: '',
  code: '',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 0,
}

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => [
    'system',
    'department-form',
    props.departmentId ?? 'create',
    props.departmentId === null ? (props.parentId ?? 'root') : 'edit',
  ],
  enabled: () => show.value,
  async query() {
    const departmentId = props.departmentId
    const parentId = props.parentId
    const [departments, department] = await Promise.all([
      getDepartmentTree(),
      departmentId === null ? null : getDepartment(departmentId),
    ])

    return {
      departments,
      formValues:
        department === null
          ? { ...defaultFormValues, parentId }
          : pick(department, ['name', 'code', 'parentId', 'status', 'sortOrder']),
    }
  },
})
const departmentTreeOptions = computed(() => {
  const departmentId = props.departmentId

  return toTreeOptions(formData.value?.departments ?? [], {
    label: (department) => `${department.name} (${department.code})`,
    ...(departmentId === null ? {} : { disabledSubtreeId: departmentId }),
  })
})
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载部门信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: { ...defaultFormValues, parentId: props.parentId },
  validators: {
    onChange: departmentFormSchema,
    onSubmit: departmentFormSchema,
  },
  onSubmit({ value }) {
    const departmentId = props.departmentId
    const parentId = props.parentId

    formError.value = null

    saveDepartmentMutation.mutate({ departmentId, parentId, value })
  },
})

const { isLoading: isSaving, ...saveDepartmentMutation } = useMutation({
  mutation: ({
    departmentId,
    value,
  }: {
    departmentId: string | null
    parentId: string | null
    value: DepartmentFormInput
  }) =>
    departmentId === null
      ? createDepartment(departmentCreateSchema.parse(value))
      : updateDepartment(departmentId, departmentUpdateSchema.parse(value)),
  onSuccess(_, { departmentId, parentId }) {
    if (!show.value || props.departmentId !== departmentId || props.parentId !== parentId) {
      return
    }

    emit('saved')
    show.value = false
  },
  onError(error, { departmentId, parentId }) {
    if (!show.value || props.departmentId !== departmentId || props.parentId !== parentId) {
      return
    }

    if (
      error instanceof SystemRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getSystemErrorMessage(error, '保存部门失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.departmentId, props.parentId] as const,
  ([isVisible, , parentId]) => {
    if (!isVisible) {
      return
    }

    saveDepartmentMutation.reset()
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
          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem label="部门名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="department-form-name"
                :value="state.value"
                placeholder="请输入部门名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="code" v-slot="{ field, state }">
            <NFormItem label="部门编码" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="department-form-code"
                :value="state.value"
                placeholder="请输入部门编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="parentId" v-slot="{ field, state }">
            <NFormItem label="上级部门" v-bind="formItemValidationProps(state.meta)">
              <NTreeSelect
                data-test="department-form-parent"
                clearable
                filterable
                default-expand-all
                :options="departmentTreeOptions"
                :value="state.value"
                placeholder="请选择上级部门"
                @update:value="(value) => field.handleChange(value === null ? null : String(value))"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="status" v-slot="{ field, state }">
            <NFormItem label="状态" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="department-form-status"
                :value="state.value"
                :options="statusSelectOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="sortOrder" v-slot="{ field, state }">
            <NFormItem label="排序" v-bind="formItemValidationProps(state.meta)">
              <NInputNumber
                data-test="department-form-sort-order"
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
              data-test="department-form-submit"
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
