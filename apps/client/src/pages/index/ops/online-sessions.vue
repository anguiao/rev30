<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import type { ButtonProps, DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItemGi,
  NGrid,
  NGridItem,
  NInput,
  NPagination,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type {
  OnlineSessionListItem,
  OnlineSessionListQuery,
  OnlineSessionListResponse,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  UserAgentSummary,
  clientIpSourceLabels,
  listOnlineSessions,
  revokeOnlineSession,
} from '../../../features/ops'
import { getErrorMessage } from '../../../utils/error'
import { ApiRequestError } from '../../../utils/request'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('在线会话')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

const username = ref('')
const createdIp = ref('')
const query = ref<OnlineSessionListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyData: OnlineSessionListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: response,
  error,
  isLoading,
} = useQuery({
  key: () => [
    'ops',
    'online-sessions',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.username ?? '',
    query.value.createdIp ?? '',
  ],
  placeholderData: () => emptyData,
  query: () => listOnlineSessions(query.value),
})
const data = computed(() => response.value ?? emptyData)
const loadErrorMessage = computed(() =>
  error.value === null ? '' : getErrorMessage(error.value, '加载在线会话失败'),
)

function handleSearch() {
  const nextUsername = username.value.trim()
  const nextCreatedIp = createdIp.value.trim()
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextUsername.length === 0 ? {} : { username: nextUsername }),
    ...(nextCreatedIp.length === 0 ? {} : { createdIp: nextCreatedIp }),
  }
}

function handleReset() {
  username.value = ''
  createdIp.value = ''
  query.value = { page: 1, pageSize: query.value.pageSize }
}

async function invalidateList() {
  await queryCache.invalidateQueries({ key: ['ops', 'online-sessions', 'list'] })
}

function confirmRevoke(item: OnlineSessionListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'online-session-revoke-confirm',
  }

  dialog.warning({
    title: '确认强制下线',
    content: `确定强制下线“${item.nickname}（${item.username}）”的此会话吗？`,
    positiveText: '强制下线',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await revokeOnlineSession(item.id)
        message.success('强制下线成功')
        await invalidateList()
      } catch (error) {
        message.error(getErrorMessage(error, '强制下线失败'))
        if (error instanceof ApiRequestError && error.status === 404) {
          await invalidateList()
        }
        return false
      }
    },
  })
}

const columns: DataTableColumns<OnlineSessionListItem> = [
  {
    title: '用户',
    key: 'user',
    minWidth: 180,
    render: (item) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', `${item.nickname}（${item.username}）`),
        ...(item.isCurrent ? [h(NTag, { type: 'success', size: 'small' }, () => '当前会话')] : []),
      ]),
  },
  {
    title: '创建 IP',
    key: 'createdIp',
    minWidth: 150,
    render: (item) =>
      h('span', { title: clientIpSourceLabels[item.createdIpSource] }, item.createdIp ?? '-'),
  },
  {
    title: '设备',
    key: 'userAgent',
    minWidth: 240,
    render: (item) => h(UserAgentSummary, { userAgent: item.userAgent }),
  },
  {
    title: '创建时间',
    key: 'createdAt',
    minWidth: 180,
    render: (item) => formatDisplayDateTime(item.createdAt),
  },
  {
    title: '最近活动',
    key: 'lastActiveAt',
    minWidth: 180,
    render: (item) => formatDisplayDateTime(item.lastActiveAt),
  },
  {
    title: '到期时间',
    key: 'expiresAt',
    minWidth: 180,
    render: (item) => formatDisplayDateTime(item.expiresAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    fixed: 'right',
    render: (item) =>
      renderTableActions([
        renderTableActionButton({
          label: '强制下线',
          accessCode: 'ops:online-session:revoke',
          type: 'error',
          dataTest: 'online-session-revoke',
          disabled: item.isCurrent,
          onClick: () => confirmRevoke(item),
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ data.total }} 个</p>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm label-placement="left" :show-feedback="false">
        <NGrid cols="1 640:12 1024:24" item-responsive :x-gap="16" :y-gap="12">
          <NFormItemGi label="用户名" span="1 640:4 1024:5" class="min-w-0">
            <NInput
              v-model:value="username"
              data-test="online-sessions-username"
              clearable
              placeholder="请输入用户名"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="创建 IP" span="1 640:4 1024:5" class="min-w-0">
            <NInput
              v-model:value="createdIp"
              data-test="online-sessions-created-ip"
              clearable
              placeholder="请输入会话创建 IP"
              class="w-full!"
            />
          </NFormItemGi>
          <NGridItem suffix span="1 640:4 1024:14">
            <div class="flex h-full items-center justify-end gap-2">
              <NButton data-test="online-sessions-search" type="primary" @click="handleSearch"
                >查询</NButton
              >
              <NButton data-test="online-sessions-reset" @click="handleReset">重置</NButton>
            </div>
          </NGridItem>
        </NGrid>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="data.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(item: OnlineSessionListItem) => item.id"
      />
      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="data.total"
        />
      </div>
    </section>
  </main>
</template>
