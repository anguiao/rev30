<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery } from '@pinia/colada'
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
  NTree,
  type TreeOption,
} from 'naive-ui'
import {
  type DepartmentTreeNode,
  type User,
  USER_STATUS_ENABLED,
  type RoleListItem,
  type UserFormInput,
  userFormSchema,
  userUpdateSchema,
} from '@rev30/shared'
import {
  SystemRequestError,
  getDepartmentTree,
  getUser,
  listRoles,
  updateUser,
  getSystemErrorMessage,
} from '.'
import { statusSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const props = defineProps<{
  userId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.userId === null ? '新增用户' : '编辑用户'))

const defaultFormValues: UserFormInput = {
  username: '',
  nickname: '',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
}

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'user-form', props.userId ?? 'none'],
  enabled: () => show.value && props.userId !== null,
  async query() {
    const userId = props.userId

    if (userId === null) {
      throw new Error('User id is required')
    }

    const [departments, roleList, user] = await Promise.all([
      getDepartmentTree(),
      listRoles({ page: 1, pageSize: 100 }),
      getUser(userId),
    ])

    return {
      departmentTreeOptions: toDepartmentTreeOptions(departments),
      roleOptions: toRoleOptions(roleList.list),
      formValues: toUserFormValues(user),
    }
  },
})
const departmentTreeOptions = computed(() => formData.value?.departmentTreeOptions ?? [])
const roleOptions = computed(() => formData.value?.roleOptions ?? [])
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载用户信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onSubmit: userFormSchema,
  },
  onSubmit({ value }) {
    const userId = props.userId

    formError.value = null

    if (userId === null) {
      return
    }

    saveUserMutation.mutate({ userId, value })
  },
})

const { isLoading: isSaving, ...saveUserMutation } = useMutation({
  mutation: ({ userId, value }: { userId: string; value: UserFormInput }) =>
    updateUser(userId, userUpdateSchema.parse(value)),
  onSuccess(_, { userId }) {
    if (!show.value || props.userId !== userId) {
      return
    }

    emit('saved')
    show.value = false
  },
  onError(error, { userId }) {
    if (!show.value || props.userId !== userId) {
      return
    }

    if (error instanceof SystemRequestError && error.field !== undefined) {
      setServerFieldError(form, error.field as keyof UserFormInput, error.message)
      return
    }

    formError.value = getSystemErrorMessage(error, '保存用户失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.userId] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    saveUserMutation.reset()
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

function toDepartmentTreeOptions(nodes: DepartmentTreeNode[]): TreeOption[] {
  return nodes.map((node) => ({
    key: node.id,
    label: `${node.name} (${node.code})`,
    children: toDepartmentTreeOptions(node.children),
  }))
}

function toRoleOptions(roles: RoleListItem[]) {
  return roles.map((role) => ({
    label: `${role.name} (${role.code})`,
    value: role.id,
  }))
}

function toUserFormValues(user: User): UserFormInput {
  return {
    ...user,
    departmentIds: user.departments.map((department) => department.id),
    roleIds: user.roles.map((role) => role.id),
  }
}
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

        <NForm class="flex flex-col gap-4" @submit.prevent="handleSubmit">
          <form.Field name="username" v-slot="{ field, state }">
            <NFormItem
              label="用户名"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInput
                data-test="user-form-username"
                :value="state.value"
                placeholder="请输入用户名"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="nickname" v-slot="{ field, state }">
            <NFormItem
              label="昵称"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInput
                data-test="user-form-nickname"
                :value="state.value"
                placeholder="请输入昵称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form.Field name="email" v-slot="{ field, state }">
              <NFormItem
                label="邮箱"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="user-form-email"
                  :value="state.value ?? ''"
                  placeholder="可选"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>

            <form.Field name="phone" v-slot="{ field, state }">
              <NFormItem
                label="手机号"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="user-form-phone"
                  :value="state.value ?? ''"
                  placeholder="可选"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>
          </div>

          <form.Field name="status" v-slot="{ field, state }">
            <NFormItem
              label="状态"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NSelect
                data-test="user-form-status"
                :value="state.value"
                :options="statusSelectOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="departmentIds" v-slot="{ field, state }">
            <NFormItem
              label="所属部门"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NTree
                data-test="user-form-departments"
                block-line
                checkable
                cascade
                :data="departmentTreeOptions"
                :checked-keys="state.value"
                @update:checked-keys="
                  (keys) => {
                    field.handleChange(keys.map(String))
                  }
                "
              />
            </NFormItem>
          </form.Field>

          <form.Field name="roleIds" v-slot="{ field, state }">
            <NFormItem
              label="角色"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NSelect
                data-test="user-form-roles"
                :value="state.value"
                multiple
                filterable
                clearable
                :options="roleOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <div class="flex justify-end">
            <NButton
              data-test="user-form-submit"
              type="primary"
              attr-type="submit"
              :loading="isSaving"
              :disabled="isLoading || !!loadError"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
