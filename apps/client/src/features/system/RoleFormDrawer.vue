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
  NTree,
} from 'naive-ui'
import {
  RESOURCE_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  roleCreateSchema,
  createRoleResourceIdsSchema,
  normalizeTreeCheckedKeys,
  roleUpdateSchema,
  type RoleFormInput,
  roleFormSchema,
  treeToArray,
} from '@rev30/shared'
import {
  SystemRequestError,
  createRole,
  getResourceTreeOptions,
  getRole,
  getSystemErrorMessage,
  updateRole,
} from '.'
import { statusSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { toTreeOptions } from '../../utils/ui'

const props = defineProps<{
  roleId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.roleId === null ? '新增系统角色' : '编辑系统角色'))

const defaultFormValues: RoleFormInput = {
  name: '',
  code: '',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 0,
  resourceIds: [],
}

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'role-form', props.roleId ?? 'create'],
  enabled: () => show.value,
  async query() {
    const roleId = props.roleId
    if (roleId === null) {
      const resources = await getResourceTreeOptions()

      return {
        resources,
        formValues: defaultFormValues,
      }
    }

    const role = await getRole(roleId)
    const resources = await getResourceTreeOptions(role.resources.map((resource) => resource.id))

    return {
      resources,
      formValues: {
        ...pick(role, ['name', 'code', 'status', 'sortOrder']),
        resourceIds: role.resources.map((resource) => resource.id),
      },
    }
  },
})
const resourceTreeOptions = computed(() =>
  toTreeOptions(formData.value?.resources ?? [], {
    label: (resource) => `${resource.name} (${resource.code})`,
    disabled: (resource) => resource.status !== RESOURCE_STATUS_ENABLED,
  }),
)
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载系统角色信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: roleFormSchema,
    onSubmit: roleFormSchema,
  },
  onSubmit({ value }) {
    const roleId = props.roleId

    formError.value = null

    saveRoleMutation.mutate({ roleId, value })
  },
})

const { isLoading: isSaving, ...saveRoleMutation } = useMutation({
  mutation: ({ roleId, value }: { roleId: string | null; value: RoleFormInput }) =>
    roleId === null
      ? createRole(roleCreateSchema.parse(value))
      : updateRole(roleId, roleUpdateSchema.parse(value)),
  onSuccess(_, { roleId }) {
    if (!show.value || props.roleId !== roleId) {
      return
    }

    emit('saved')
    show.value = false
  },
  onError(error, { roleId }) {
    if (!show.value || props.roleId !== roleId) {
      return
    }

    if (
      error instanceof SystemRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getSystemErrorMessage(error, '保存系统角色失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.roleId] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    saveRoleMutation.reset()
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

const resourceIdsSchema = computed(() =>
  createRoleResourceIdsSchema(treeToArray(formData.value?.resources ?? [])),
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
                data-test="role-form-name"
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
                data-test="role-form-code"
                :value="state.value"
                placeholder="请输入编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="status" v-slot="{ field, state }">
            <NFormItem label="状态" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="role-form-status"
                :value="state.value"
                :options="statusSelectOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="sortOrder" v-slot="{ field, state }">
            <NFormItem label="排序" v-bind="formItemValidationProps(state.meta)">
              <NInputNumber
                data-test="role-form-sort-order"
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

          <form.Field
            v-if="formData !== undefined"
            name="resourceIds"
            :validators="{ onChange: resourceIdsSchema }"
            v-slot="{ field, state }"
          >
            <NFormItem label="权限资源" v-bind="formItemValidationProps(state.meta)">
              <NTree
                data-test="role-form-resources"
                block-line
                checkable
                :cascade="false"
                :data="resourceTreeOptions"
                :checked-keys="state.value"
                @update:checked-keys="
                  (keys) => {
                    field.handleChange(
                      normalizeTreeCheckedKeys(formData?.resources ?? [], keys, state.value),
                    )
                  }
                "
              />
            </NFormItem>
          </form.Field>

          <div class="flex justify-end gap-3">
            <NButton @click="show = false">取消</NButton>
            <NButton
              data-test="role-form-submit"
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
