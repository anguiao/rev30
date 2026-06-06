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
  NSelect,
  NTreeSelect,
} from 'naive-ui'
import {
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  type UserCreateResponse,
  USER_STATUS_ENABLED,
  type UserFormInput,
  userCreateSchema,
  userFormSchema,
  userUpdateSchema,
} from '@rev30/contracts'
import { createUser, getDepartmentTreeOptions, getRoleOptions, getUser, updateUser } from '.'
import { UserAvatarUpload } from '../users'
import { statusSelectOptions } from './labels'
import { getErrorMessage } from '../../utils/error'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { ApiRequestError } from '../../utils/request'
import { toSelectOptions, toTreeOptions } from '../../utils/ui'

const props = defineProps<{
  userId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: [payload?: UserCreateResponse]
}>()

const drawerTitle = computed(() => (props.userId === null ? '新增系统用户' : '编辑系统用户'))

const defaultFormValues: UserFormInput = {
  username: '',
  nickname: '',
  avatarId: null,
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'user-form', props.userId ?? 'create'],
  enabled: () => show.value,
  async query() {
    const userId = props.userId
    if (userId === null) {
      const [departments, roles] = await Promise.all([getDepartmentTreeOptions(), getRoleOptions()])

      return {
        departments,
        roles,
        formValues: defaultFormValues,
      }
    }

    const user = await getUser(userId)
    const [departments, roles] = await Promise.all([
      getDepartmentTreeOptions(user.departments.map((department) => department.id)),
      getRoleOptions(user.roles.map((role) => role.id)),
    ])

    return {
      departments,
      roles,
      formValues: {
        ...pick(user, ['username', 'nickname', 'avatarId', 'email', 'phone', 'status']),
        departmentIds: user.departments.map((department) => department.id),
        roleIds: user.roles.map((role) => role.id),
      },
    }
  },
})
const departmentTreeOptions = computed(() =>
  toTreeOptions(formData.value?.departments ?? [], {
    label: (department) => `${department.name} (${department.code})`,
    disabled: (department) => department.status !== DEPARTMENT_STATUS_ENABLED,
  }),
)
const roleOptions = computed(() =>
  toSelectOptions(formData.value?.roles ?? [], {
    label: (role) => `${role.name} (${role.code})`,
    value: (role) => role.id,
    disabled: (role) => role.status !== ROLE_STATUS_ENABLED,
  }),
)
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载系统用户信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: userFormSchema,
    onSubmit: userFormSchema,
  },
  onSubmit({ value }) {
    const userId = props.userId

    formError.value = null

    saveUserMutation.mutate({ userId, value })
  },
})

const { isLoading: isSaving, ...saveUserMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  async mutation({ userId, value }: { userId: string | null; value: UserFormInput }) {
    return userId === null
      ? createUser(userCreateSchema.parse(value))
      : updateUser(userId, userUpdateSchema.parse(value))
  },
  onSuccess(data, { userId }, { sessionId }) {
    if (!show.value || props.userId !== userId || sessionId !== drawerSessionId.value) {
      return
    }

    if (userId !== null) {
      void queryCache.invalidateQueries({
        key: ['system', 'user-form', userId],
        exact: true,
      })
    }

    if (userId === null) {
      emit('saved', data as UserCreateResponse)
    } else {
      emit('saved')
    }
    show.value = false
  },
  onError(error, { userId }, { sessionId }) {
    if (!show.value || props.userId !== userId || sessionId !== drawerSessionId.value) {
      return
    }

    if (error instanceof ApiRequestError && setServerFieldError(form, error.field, error.message)) {
      return
    }

    formError.value = getErrorMessage(error, '保存系统用户失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

function handleAvatarUploadError(error: unknown) {
  setServerFieldError(form, 'avatarId', getErrorMessage(error, '上传用户头像失败'))
}

watch(
  () => [show.value, props.userId] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
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

    if (form.state.isDirty || !form.state.isDefaultValue) {
      return
    }

    form.reset(formValues)
  },
  {
    immediate: true,
  },
)

function toDepartmentIds(value: Array<string | number> | null) {
  return value?.map(String) ?? []
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

        <NForm @submit.prevent="handleSubmit">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div class="space-y-0">
              <form.Field name="username" v-slot="{ field, state }">
                <NFormItem label="用户名" v-bind="formItemValidationProps(state.meta)">
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
                <NFormItem label="昵称" v-bind="formItemValidationProps(state.meta)">
                  <NInput
                    data-test="user-form-nickname"
                    :value="state.value"
                    placeholder="请输入昵称"
                    @blur="field.handleBlur"
                    @update:value="field.handleChange"
                  />
                </NFormItem>
              </form.Field>
            </div>

            <form.Field name="avatarId" v-slot="{ field, state }">
              <NFormItem v-bind="formItemValidationProps(state.meta)">
                <div class="flex justify-start md:justify-end">
                  <UserAvatarUpload
                    data-test="user-avatar-upload"
                    :avatar-id="state.value ?? null"
                    :nickname="form.state.values.nickname"
                    :username="form.state.values.username"
                    :size="120"
                    @uploaded="field.handleChange"
                    @error="handleAvatarUploadError"
                  />
                </div>
              </NFormItem>
            </form.Field>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form.Field name="email" v-slot="{ field, state }">
              <NFormItem label="邮箱" v-bind="formItemValidationProps(state.meta)">
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
              <NFormItem label="手机号" v-bind="formItemValidationProps(state.meta)">
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
            <NFormItem label="状态" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="user-form-status"
                :value="state.value"
                :options="statusSelectOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="departmentIds" v-slot="{ field, state }">
            <NFormItem label="所属部门" v-bind="formItemValidationProps(state.meta)">
              <NTreeSelect
                data-test="user-form-departments"
                multiple
                checkable
                clearable
                filterable
                default-expand-all
                max-tag-count="responsive"
                :options="departmentTreeOptions"
                :value="state.value"
                placeholder="请选择所属部门"
                @update:value="
                  (value) => {
                    field.handleChange(toDepartmentIds(value))
                  }
                "
              />
            </NFormItem>
          </form.Field>

          <form.Field name="roleIds" v-slot="{ field, state }">
            <NFormItem label="角色" v-bind="formItemValidationProps(state.meta)">
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

          <div class="flex justify-end gap-3">
            <NButton @click="show = false">取消</NButton>
            <NButton
              data-test="user-form-submit"
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
