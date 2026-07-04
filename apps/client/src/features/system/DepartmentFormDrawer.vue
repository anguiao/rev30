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
  NTreeSelect,
} from 'naive-ui'
import {
  DEPARTMENT_STATUS_ENABLED,
  departmentCreateSchema,
  departmentFormSchema,
  type DepartmentFormInput,
  departmentUpdateSchema,
} from '@rev30/contracts'
import { createDepartment, getDepartment, getDepartmentTreeOptions, updateDepartment } from '.'
import { statusSelectOptions } from './labels'
import { getErrorMessage } from '../../utils/error'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { ApiRequestError } from '../../utils/request'
import { toTreeOptions } from '../../utils/ui'

const props = defineProps<{
  departmentId: string | null
  parentId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.departmentId === null ? '新增组织部门' : '编辑组织部门'))

const defaultFormValues: DepartmentFormInput = {
  name: '',
  code: '',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 0,
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

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
    if (departmentId === null) {
      const departments =
        parentId === null
          ? await getDepartmentTreeOptions()
          : await getDepartmentTreeOptions([parentId])

      return {
        departments,
        formValues: { ...defaultFormValues, parentId },
      }
    }

    const department = await getDepartment(departmentId)
    const departments = await getDepartmentTreeOptions(
      department.parentId === null ? [departmentId] : [department.parentId, departmentId],
    )

    return {
      departments,
      formValues: pick(department, ['name', 'code', 'parentId', 'status', 'sortOrder']),
    }
  },
})
const departmentTreeOptions = computed(() => {
  const departmentId = props.departmentId

  return toTreeOptions(formData.value?.departments ?? [], {
    label: (department) => `${department.name} (${department.code})`,
    disabled: (department) => department.status !== DEPARTMENT_STATUS_ENABLED,
    ...(departmentId === null ? {} : { disabledSubtreeRootId: departmentId }),
  })
})
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载组织部门信息失败'),
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
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
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
  onSuccess(_, { departmentId, parentId }, { sessionId }) {
    if (
      !show.value ||
      props.departmentId !== departmentId ||
      props.parentId !== parentId ||
      sessionId !== drawerSessionId.value
    ) {
      return
    }

    if (departmentId !== null) {
      void queryCache.invalidateQueries({
        key: ['system', 'department-form', departmentId, 'edit'],
        exact: true,
      })
    }

    emit('saved')
    show.value = false
  },
  onError(error, { departmentId, parentId }, { sessionId }) {
    if (
      !show.value ||
      props.departmentId !== departmentId ||
      props.parentId !== parentId ||
      sessionId !== drawerSessionId.value
    ) {
      return
    }

    if (error instanceof ApiRequestError && setServerFieldError(form, error.field, error.message)) {
      return
    }

    formError.value = getErrorMessage(error, '保存组织部门失败')
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

    drawerSessionId.value += 1
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
            <NFormItem label="名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="department-form-name"
                :value="state.value"
                placeholder="请输入名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="code" v-slot="{ field, state }">
            <NFormItem label="编码" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="department-form-code"
                :value="state.value"
                placeholder="请输入编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="parentId" v-slot="{ field, state }">
            <NFormItem label="上级" v-bind="formItemValidationProps(state.meta)">
              <NTreeSelect
                data-test="department-form-parent"
                clearable
                filterable
                default-expand-all
                :options="departmentTreeOptions"
                :value="state.value"
                placeholder="请选择上级"
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
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton @click="show = false">取消</NButton>
          <NButton
            data-test="department-form-submit"
            type="primary"
            :disabled="isLoading || isSaving || !!loadError"
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
