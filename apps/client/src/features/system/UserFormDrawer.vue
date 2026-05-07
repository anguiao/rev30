<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'
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
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type RoleListItem,
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
import { statusLabels } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

type UserFormData = z.input<typeof userUpdateSchema>

const props = defineProps<{
  show: boolean
  userId: string | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
}>()

const defaultFormValues: UserFormData = {
  username: '',
  nickname: '',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
}

const statusOptions = [
  {
    label: statusLabels[USER_STATUS_ENABLED],
    value: USER_STATUS_ENABLED,
  },
  {
    label: statusLabels[USER_STATUS_DISABLED],
    value: USER_STATUS_DISABLED,
  },
]

const departmentTreeOptions = ref<TreeOption[]>([])
const roleOptions = ref<Array<{ label: string; value: string }>>([])
const loadError = ref<string | null>(null)
const formError = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const loadToken = ref(0)
const saveToken = ref(0)

const drawerTitle = computed(() => '编辑用户')

function isActiveLoad(currentLoadToken: number, loadUserId: string | null) {
  return loadToken.value === currentLoadToken && props.show && props.userId === loadUserId
}

function isActiveSave(currentSaveToken: number, submittedUserId: string | null) {
  return saveToken.value === currentSaveToken && props.show && props.userId === submittedUserId
}

function handleSubmit() {
  if (loading.value || saving.value || loadError.value !== null) {
    return
  }

  void form.handleSubmit()
}

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onSubmit: userUpdateSchema,
  },
  async onSubmit({ value }) {
    const currentSaveToken = saveToken.value + 1
    const submittedUserId = props.userId

    saveToken.value = currentSaveToken
    formError.value = null
    saving.value = true

    try {
      if (submittedUserId === null) {
        formError.value = '请先选择用户'
        return
      }

      await updateUser(submittedUserId, userUpdateSchema.parse(value))

      if (!isActiveSave(currentSaveToken, submittedUserId)) {
        return
      }

      emit('saved')
      emit('update:show', false)
    } catch (error) {
      if (!isActiveSave(currentSaveToken, submittedUserId)) {
        return
      }

      if (error instanceof SystemRequestError && error.field !== undefined) {
        setServerFieldError(form, error.field as keyof UserFormData, error.message)
        return
      }

      formError.value = getSystemErrorMessage(error, '保存用户失败')
    } finally {
      if (isActiveSave(currentSaveToken, submittedUserId)) {
        saving.value = false
      }
    }
  },
})

function applyFormValues(values: UserFormData) {
  form.reset()
  form.setFieldValue('username', values.username)
  form.setFieldValue('nickname', values.nickname)
  form.setFieldValue('email', values.email)
  form.setFieldValue('phone', values.phone)
  form.setFieldValue('status', values.status)
  form.setFieldValue('departmentIds', values.departmentIds)
  form.setFieldValue('roleIds', values.roleIds)
}

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

function toUserFormValues(user: User): UserFormData {
  return {
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    status: user.status,
    departmentIds: user.departments.map((department) => department.id),
    roleIds: user.roles.map((role) => role.id),
  }
}

function resetDrawerState() {
  loadToken.value += 1
  saveToken.value += 1
  form.reset()
  departmentTreeOptions.value = []
  roleOptions.value = []
  loadError.value = null
  formError.value = null
  loading.value = false
  saving.value = false
}

async function loadForm() {
  const currentLoadToken = loadToken.value + 1
  const loadUserId = props.userId

  loadToken.value = currentLoadToken
  loading.value = true
  loadError.value = null
  formError.value = null

  try {
    const [departments, roleList, user] = await Promise.all([
      getDepartmentTree(),
      listRoles({ page: 1, pageSize: 100 }),
      loadUserId === null ? Promise.resolve(null) : getUser(loadUserId),
    ])

    if (!isActiveLoad(currentLoadToken, loadUserId)) {
      return
    }

    departmentTreeOptions.value = toDepartmentTreeOptions(departments)
    roleOptions.value = toRoleOptions(roleList.list)

    if (loadUserId === null) {
      loadError.value = '请先选择用户'
      applyFormValues(defaultFormValues)
      return
    }

    if (user === null) {
      applyFormValues(defaultFormValues)
      return
    }

    applyFormValues(toUserFormValues(user))
  } catch (error) {
    if (!isActiveLoad(currentLoadToken, loadUserId)) {
      return
    }

    loadError.value = getSystemErrorMessage(error, '加载用户信息失败')
  } finally {
    if (isActiveLoad(currentLoadToken, loadUserId)) {
      loading.value = false
    }
  }
}

watch(
  () => [props.show, props.userId] as const,
  ([show, userId], previousValue) => {
    if (!show) {
      resetDrawerState()
      return
    }

    const previousShow = previousValue?.[0]
    const previousUserId = previousValue?.[1]

    if (!previousShow || previousUserId !== userId) {
      saveToken.value += 1
      saving.value = false
      void loadForm()
    }
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <NDrawer :show="show" placement="right" :width="640" @update:show="emit('update:show', $event)">
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
                :value="state.value ?? ''"
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
                :value="state.value ?? ''"
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
                  :value="(state.value as string | null) ?? ''"
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
                  :value="(state.value as string | null) ?? ''"
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
                :value="state.value ?? USER_STATUS_ENABLED"
                :options="statusOptions"
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
                :checked-keys="(state.value ?? []) as string[]"
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
                :value="(state.value ?? []) as string[]"
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
              :loading="saving"
              :disabled="loading || loadError !== null"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
