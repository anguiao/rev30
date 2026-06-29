<script setup lang="ts">
import { computed, ref, type HTMLAttributes } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { useQuery, useQueryCache } from '@pinia/colada'
import type { ButtonProps } from 'naive-ui'
import {
  NAlert,
  NButton,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPagination,
  NSpin,
  NTabPane,
  NTabs,
  useDialog,
  useMessage,
} from 'naive-ui'
import type {
  BuiltinIconListResponse,
  BuiltinIconSetItem,
  BuiltinIconSetListResponse,
  CustomIconItem,
  CustomIconListResponse,
  CustomIconSet,
  CustomIconSetListResponse,
  IconSetIconListQuery,
  IconSetListQuery,
} from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { getErrorMessage } from '../../../utils/error'
import IconGrid from '../../../features/content/IconGrid.vue'
import IconSetFormDrawer from '../../../features/content/IconSetFormDrawer.vue'
import IconUploadDrawer from '../../../features/content/IconUploadDrawer.vue'
import {
  deleteCustomIcon,
  deleteCustomIconSet,
  exportCustomIconSet,
  listBuiltinIcons,
  listBuiltinIconSets,
  listCustomIcons,
  listCustomIconSets,
  renameCustomIcon,
} from '../../../features/content'
import { useAuthStore } from '../../../stores/auth'

const pageTitle = useAdminPageTitle('图标库')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()
const auth = useAuthStore()

type IconSetsTab = 'builtin' | 'custom'

const activeTab = ref<IconSetsTab>('builtin')
const builtinTabProps = { 'data-test': 'icon-sets-tab-builtin' } as unknown as HTMLAttributes
const customTabProps = { 'data-test': 'icon-sets-tab-custom' } as unknown as HTMLAttributes
const filterDebounceMs = 250

const builtinSetKeyword = ref('')
const builtinIconKeyword = ref('')
const builtinSetQuery = ref<IconSetListQuery>({
  page: 1,
  pageSize: 20,
} as IconSetListQuery)
const builtinIconQuery = ref<IconSetIconListQuery>({
  page: 1,
  pageSize: 80,
} as IconSetIconListQuery)
const selectedBuiltinPrefix = ref<string | null>(null)

const customSetKeyword = ref('')
const customIconKeyword = ref('')
const customSetQuery = ref<IconSetListQuery>({
  page: 1,
  pageSize: 20,
} as IconSetListQuery)
const customIconQuery = ref<IconSetIconListQuery>({
  page: 1,
  pageSize: 80,
} as IconSetIconListQuery)
const selectedCustomPrefix = ref<string | null>(null)

const isIconSetDrawerVisible = ref(false)
const editingCustomSet = ref<CustomIconSet | null>(null)
const isUploadDrawerVisible = ref(false)
const renamingIcon = ref<CustomIconItem | null>(null)
const renameIconName = ref('')
const isRenamingIcon = ref(false)

const emptyBuiltinSetsData: BuiltinIconSetListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: builtinSetQuery.value.pageSize,
}
const emptyBuiltinIconsData: BuiltinIconListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: builtinIconQuery.value.pageSize,
}
const emptyCustomSetsData: CustomIconSetListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: customSetQuery.value.pageSize,
}
const emptyCustomIconsData: CustomIconListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: customIconQuery.value.pageSize,
}

const {
  data: builtinSetsResponse,
  error: builtinSetsError,
  isLoading: isLoadingBuiltinSets,
} = useQuery({
  key: () => [
    'content',
    'icon-sets',
    'builtin',
    'sets',
    builtinSetQuery.value.page,
    builtinSetQuery.value.pageSize,
    builtinSetQuery.value.keyword ?? '',
  ],
  enabled: () => activeTab.value === 'builtin',
  placeholderData: () => emptyBuiltinSetsData,
  query: () => listBuiltinIconSets(builtinSetQuery.value),
})

const {
  data: builtinIconsResponse,
  error: builtinIconsError,
  isLoading: isLoadingBuiltinIcons,
} = useQuery({
  key: () => [
    'content',
    'icon-sets',
    'builtin',
    'icons',
    builtinIconQuery.value.page,
    builtinIconQuery.value.pageSize,
    builtinIconQuery.value.keyword ?? '',
    builtinIconQuery.value.prefix ?? '',
  ],
  enabled: () => activeTab.value === 'builtin',
  placeholderData: () => emptyBuiltinIconsData,
  query: () => listBuiltinIcons(builtinIconQuery.value),
})

const {
  data: customSetsResponse,
  error: customSetsError,
  isLoading: isLoadingCustomSets,
} = useQuery({
  key: () => [
    'content',
    'icon-sets',
    'custom',
    'sets',
    customSetQuery.value.page,
    customSetQuery.value.pageSize,
    customSetQuery.value.keyword ?? '',
  ],
  enabled: () => activeTab.value === 'custom',
  placeholderData: () => emptyCustomSetsData,
  query: () => listCustomIconSets(customSetQuery.value),
})

const {
  data: customIconsResponse,
  error: customIconsError,
  isLoading: isLoadingCustomIcons,
} = useQuery({
  key: () => [
    'content',
    'icon-sets',
    'custom',
    'icons',
    customIconQuery.value.page,
    customIconQuery.value.pageSize,
    customIconQuery.value.keyword ?? '',
    customIconQuery.value.prefix ?? '',
  ],
  enabled: () => activeTab.value === 'custom',
  placeholderData: () => emptyCustomIconsData,
  query: () => listCustomIcons(customIconQuery.value),
})

const builtinSetsData = computed(() => builtinSetsResponse.value ?? emptyBuiltinSetsData)
const builtinIconsData = computed(() => builtinIconsResponse.value ?? emptyBuiltinIconsData)
const customSetsData = computed(() => customSetsResponse.value ?? emptyCustomSetsData)
const customIconsData = computed(() => customIconsResponse.value ?? emptyCustomIconsData)
const selectedBuiltinSet = computed(
  () =>
    builtinSetsData.value.list.find((iconSet) => iconSet.prefix === selectedBuiltinPrefix.value) ??
    null,
)
const selectedCustomSet = computed(
  () =>
    customSetsData.value.list.find((iconSet) => iconSet.prefix === selectedCustomPrefix.value) ??
    null,
)
const canRenameCustomIcon = computed(() => auth.can('content:icon-set:update'))
const canDeleteCustomIcon = computed(() => auth.can('content:icon-set:delete'))

const builtinSetErrorMessage = computed(() =>
  builtinSetsError.value === null
    ? ''
    : getErrorMessage(builtinSetsError.value, '加载内置图标集失败'),
)
const builtinIconErrorMessage = computed(() =>
  builtinIconsError.value === null
    ? ''
    : getErrorMessage(builtinIconsError.value, '加载内置图标失败'),
)
const customSetErrorMessage = computed(() =>
  customSetsError.value === null
    ? ''
    : getErrorMessage(customSetsError.value, '加载自定义图标集失败'),
)
const customIconErrorMessage = computed(() =>
  customIconsError.value === null
    ? ''
    : getErrorMessage(customIconsError.value, '加载自定义图标失败'),
)

function toSetQuery(keyword: string, pageSize: number): IconSetListQuery {
  const nextKeyword = keyword.trim()

  return {
    page: 1,
    pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
  } as IconSetListQuery
}

function toIconQuery(
  keyword: string,
  pageSize: number,
  prefix: string | null,
): IconSetIconListQuery {
  const nextKeyword = keyword.trim()

  return {
    page: 1,
    pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(prefix === null ? {} : { prefix }),
  } as IconSetIconListQuery
}

function selectBuiltinSet(iconSet: BuiltinIconSetItem | null) {
  selectedBuiltinPrefix.value = iconSet?.prefix ?? null
  builtinIconQuery.value = toIconQuery(
    builtinIconKeyword.value,
    builtinIconQuery.value.pageSize,
    selectedBuiltinPrefix.value,
  )
}

watchDebounced(
  builtinSetKeyword,
  () => {
    builtinSetQuery.value = toSetQuery(builtinSetKeyword.value, builtinSetQuery.value.pageSize)
  },
  { debounce: filterDebounceMs },
)

watchDebounced(
  builtinIconKeyword,
  () => {
    builtinIconQuery.value = toIconQuery(
      builtinIconKeyword.value,
      builtinIconQuery.value.pageSize,
      selectedBuiltinPrefix.value,
    )
  },
  { debounce: filterDebounceMs },
)

watchDebounced(
  customSetKeyword,
  () => {
    customSetQuery.value = toSetQuery(customSetKeyword.value, customSetQuery.value.pageSize)
  },
  { debounce: filterDebounceMs },
)

watchDebounced(
  customIconKeyword,
  () => {
    customIconQuery.value = toIconQuery(
      customIconKeyword.value,
      customIconQuery.value.pageSize,
      selectedCustomPrefix.value,
    )
  },
  { debounce: filterDebounceMs },
)

function selectCustomSet(iconSet: CustomIconSet | null) {
  selectedCustomPrefix.value = iconSet?.prefix ?? null
  customIconQuery.value = toIconQuery(
    customIconKeyword.value,
    customIconQuery.value.pageSize,
    selectedCustomPrefix.value,
  )
}

async function invalidateCustomIconSetQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'icon-sets', 'custom'],
  })
}

async function invalidateCustomIconQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'icon-sets', 'custom', 'icons'],
  })
}

async function copyIcon(icon: string) {
  await navigator.clipboard.writeText(icon)
  message.success('已复制图标名称')
}

function openCreateCustomSetDrawer() {
  editingCustomSet.value = null
  isIconSetDrawerVisible.value = true
}

function openEditCustomSetDrawer(iconSet: CustomIconSet) {
  editingCustomSet.value = iconSet
  isIconSetDrawerVisible.value = true
}

async function handleCustomSetSaved(iconSet: CustomIconSet) {
  selectedCustomPrefix.value = iconSet.prefix
  customIconQuery.value = toIconQuery(
    customIconKeyword.value,
    customIconQuery.value.pageSize,
    selectedCustomPrefix.value,
  )
  message.success('保存图标集成功')
  await invalidateCustomIconSetQueries()
}

function openUploadDrawer() {
  if (selectedCustomPrefix.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  isUploadDrawerVisible.value = true
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)

  try {
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}

async function handleIconsUploaded() {
  message.success('上传图标成功')
  await invalidateCustomIconSetQueries()
}

async function exportSelectedCustomSet() {
  if (selectedCustomPrefix.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  try {
    const file = await exportCustomIconSet(selectedCustomPrefix.value)
    downloadFile(file.blob, file.filename)
    message.success('导出图标集成功')
  } catch (error) {
    message.error(getErrorMessage(error, '导出图标集失败'))
  }
}

function confirmDeleteCustomSet(iconSet: CustomIconSet) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'custom-icon-set-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除自定义图标集“${iconSet.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteCustomIconSet(iconSet.prefix)

        if (selectedCustomPrefix.value === iconSet.prefix) {
          selectedCustomPrefix.value = null
          customIconQuery.value = toIconQuery(
            customIconKeyword.value,
            customIconQuery.value.pageSize,
            null,
          )
        }

        message.success('删除图标集成功')
        await invalidateCustomIconSetQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标集失败'))
        return false
      }
    },
  })
}

function openRenameIconModal(icon: CustomIconItem) {
  renamingIcon.value = icon
  renameIconName.value = icon.name
}

async function submitRenameIcon() {
  const icon = renamingIcon.value
  const nextName = renameIconName.value.trim()

  if (icon === null || nextName.length === 0 || isRenamingIcon.value) {
    return
  }

  isRenamingIcon.value = true

  try {
    await renameCustomIcon(icon.prefix, icon.name, { name: nextName })

    message.success('重命名图标成功')
    renamingIcon.value = null
    await invalidateCustomIconQueries()
  } catch (error) {
    message.error(getErrorMessage(error, '重命名图标失败'))
  } finally {
    isRenamingIcon.value = false
  }
}

function confirmDeleteCustomIcon(icon: CustomIconItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'custom-icon-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除图标“${icon.icon}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteCustomIcon(icon.prefix, icon.name)

        message.success('删除图标成功')
        await invalidateCustomIconSetQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标失败'))
        return false
      }
    },
  })
}
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
    </header>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="builtin" tab="内置图标" :tab-props="builtinTabProps">
        <div class="space-y-5 pt-4">
          <NAlert v-if="builtinSetErrorMessage" type="error">{{ builtinSetErrorMessage }}</NAlert>
          <NAlert v-if="builtinIconErrorMessage" type="error">{{ builtinIconErrorMessage }}</NAlert>

          <section class="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
            <aside
              class="space-y-3 rounded-ui border border-stone-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">
                    内置图标集
                  </div>
                  <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
                    共 {{ builtinSetsData.total }} 个
                  </div>
                </div>
              </div>

              <NInput
                v-model:value="builtinSetKeyword"
                data-test="builtin-icon-set-filter"
                clearable
                placeholder="筛选图标集"
              />

              <NSpin :show="isLoadingBuiltinSets">
                <div class="space-y-1">
                  <button
                    type="button"
                    class="w-full rounded-md px-3 py-2 text-left transition-colors"
                    :class="
                      selectedBuiltinPrefix === null
                        ? 'bg-primary/5 text-primary'
                        : 'text-stone-700 hover:bg-stone-50 dark:text-zinc-200 dark:hover:bg-zinc-800'
                    "
                    @click="selectBuiltinSet(null)"
                  >
                    <div class="truncate text-sm font-medium">全部内置</div>
                    <div class="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
                      {{ builtinSetsData.total }} 个图标集
                    </div>
                  </button>

                  <button
                    v-for="iconSet in builtinSetsData.list"
                    :key="iconSet.prefix"
                    data-test="builtin-icon-set"
                    type="button"
                    class="w-full rounded-md px-3 py-2 text-left transition-colors"
                    :class="
                      selectedBuiltinPrefix === iconSet.prefix
                        ? 'bg-primary/5'
                        : 'hover:bg-stone-50 dark:hover:bg-zinc-800'
                    "
                    @click="selectBuiltinSet(iconSet)"
                  >
                    <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
                      {{ iconSet.name }}
                    </div>
                    <div class="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
                      {{ iconSet.total }} 个图标
                    </div>
                  </button>

                  <NEmpty v-if="builtinSetsData.list.length === 0" size="small" />
                </div>
              </NSpin>

              <div class="flex justify-end">
                <NPagination
                  v-model:page="builtinSetQuery.page"
                  :page-size="builtinSetQuery.pageSize"
                  :item-count="builtinSetsData.total"
                  size="small"
                />
              </div>
            </aside>

            <section class="min-w-0 space-y-4">
              <div
                class="flex flex-col gap-3 rounded-ui border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">内置图标</div>
                  <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
                    <template v-if="selectedBuiltinSet">
                      {{ selectedBuiltinSet.name }} / {{ selectedBuiltinSet.prefix }}
                    </template>
                    <template v-else>
                      {{ selectedBuiltinPrefix ?? '全部内置图标集' }}
                    </template>
                  </div>
                </div>

                <NInput
                  v-model:value="builtinIconKeyword"
                  data-test="builtin-icon-filter"
                  clearable
                  placeholder="筛选图标"
                  class="w-full sm:w-72!"
                />
              </div>

              <NSpin :show="isLoadingBuiltinIcons">
                <IconGrid
                  v-if="builtinIconsData.list.length > 0"
                  :icons="builtinIconsData.list"
                  :editable="false"
                  :show-set-name="selectedBuiltinPrefix === null"
                  @copy="copyIcon"
                />
                <NEmpty v-else />
              </NSpin>

              <div class="flex justify-end">
                <NPagination
                  v-model:page="builtinIconQuery.page"
                  :page-size="builtinIconQuery.pageSize"
                  :item-count="builtinIconsData.total"
                />
              </div>
            </section>
          </section>
        </div>
      </NTabPane>

      <NTabPane name="custom" tab="自定义图标" :tab-props="customTabProps">
        <div class="space-y-5 pt-4">
          <NAlert v-if="customSetErrorMessage" type="error">{{ customSetErrorMessage }}</NAlert>
          <NAlert v-if="customIconErrorMessage" type="error">{{ customIconErrorMessage }}</NAlert>

          <section class="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
            <aside
              class="space-y-3 rounded-ui border border-stone-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">
                    自定义图标集
                  </div>
                  <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
                    共 {{ customSetsData.total }} 个
                  </div>
                </div>
                <NButton
                  v-can="'content:icon-set:create'"
                  data-test="custom-icon-set-create"
                  type="primary"
                  size="small"
                  @click="openCreateCustomSetDrawer"
                >
                  创建图标集
                </NButton>
              </div>

              <NInput
                v-model:value="customSetKeyword"
                data-test="custom-icon-set-filter"
                clearable
                placeholder="筛选图标集"
              />

              <NSpin :show="isLoadingCustomSets">
                <div class="space-y-1">
                  <button
                    type="button"
                    class="w-full rounded-md px-3 py-2 text-left transition-colors"
                    :class="
                      selectedCustomPrefix === null
                        ? 'bg-primary/5 text-primary'
                        : 'text-stone-700 hover:bg-stone-50 dark:text-zinc-200 dark:hover:bg-zinc-800'
                    "
                    @click="selectCustomSet(null)"
                  >
                    <div class="truncate text-sm font-medium">全部自定义</div>
                    <div class="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
                      {{ customSetsData.total }} 个图标集
                    </div>
                  </button>

                  <div
                    v-for="iconSet in customSetsData.list"
                    :key="iconSet.prefix"
                    class="rounded-md transition-colors"
                    :class="
                      selectedCustomPrefix === iconSet.prefix
                        ? 'bg-primary/5'
                        : 'hover:bg-stone-50 dark:hover:bg-zinc-800'
                    "
                  >
                    <button
                      type="button"
                      data-test="custom-icon-set"
                      class="w-full px-3 pt-2 text-left"
                      @click="selectCustomSet(iconSet)"
                    >
                      <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
                        {{ iconSet.name }}
                      </div>
                      <div class="mt-0.5 truncate text-xs text-stone-500 dark:text-zinc-400">
                        {{ iconSet.iconCount }} 个图标 / {{ iconSet.prefix }}
                      </div>
                    </button>

                    <div class="flex items-center gap-2 px-3 pt-0.5 pb-2">
                      <NButton
                        v-can="'content:icon-set:update'"
                        text
                        size="tiny"
                        type="primary"
                        @click.stop="openEditCustomSetDrawer(iconSet)"
                      >
                        编辑
                      </NButton>
                      <NButton
                        v-can="'content:icon-set:delete'"
                        text
                        size="tiny"
                        type="error"
                        @click.stop="confirmDeleteCustomSet(iconSet)"
                      >
                        删除
                      </NButton>
                    </div>
                  </div>

                  <NEmpty v-if="customSetsData.list.length === 0" size="small" />
                </div>
              </NSpin>

              <div class="flex justify-end">
                <NPagination
                  v-model:page="customSetQuery.page"
                  :page-size="customSetQuery.pageSize"
                  :item-count="customSetsData.total"
                  size="small"
                />
              </div>
            </aside>

            <section class="min-w-0 space-y-4">
              <div
                class="flex flex-col gap-3 rounded-ui border border-stone-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">
                    自定义图标
                  </div>
                  <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
                    <template v-if="selectedCustomSet">
                      {{ selectedCustomSet.name }} / {{ selectedCustomSet.prefix }}
                    </template>
                    <template v-else>全部自定义图标集</template>
                  </div>
                </div>

                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <NInput
                    v-model:value="customIconKeyword"
                    data-test="custom-icon-filter"
                    clearable
                    placeholder="筛选图标"
                    class="w-full sm:w-72!"
                  />
                  <NButton
                    v-can="'content:icon-set:create'"
                    data-test="custom-icon-set-upload"
                    :disabled="selectedCustomPrefix === null"
                    @click="openUploadDrawer"
                  >
                    上传 SVG
                  </NButton>
                  <NButton
                    v-can="'content:icon-set:export'"
                    data-test="custom-icon-set-export"
                    :disabled="selectedCustomPrefix === null"
                    @click="exportSelectedCustomSet"
                  >
                    导出 JSON
                  </NButton>
                </div>
              </div>

              <NSpin :show="isLoadingCustomIcons">
                <IconGrid
                  v-if="customIconsData.list.length > 0"
                  :icons="customIconsData.list"
                  :editable="true"
                  :show-set-name="selectedCustomPrefix === null"
                  :can-rename="canRenameCustomIcon"
                  :can-delete="canDeleteCustomIcon"
                  @copy="copyIcon"
                  @rename="openRenameIconModal"
                  @delete="confirmDeleteCustomIcon"
                />
                <NEmpty v-else />
              </NSpin>

              <div class="flex justify-end">
                <NPagination
                  v-model:page="customIconQuery.page"
                  :page-size="customIconQuery.pageSize"
                  :item-count="customIconsData.total"
                />
              </div>
            </section>
          </section>
        </div>
      </NTabPane>
    </NTabs>

    <IconSetFormDrawer
      v-model:show="isIconSetDrawerVisible"
      :editing-set="editingCustomSet"
      @saved="handleCustomSetSaved"
    />

    <IconUploadDrawer
      v-model:show="isUploadDrawerVisible"
      :prefix="selectedCustomPrefix"
      @uploaded="handleIconsUploaded"
    />

    <NModal
      :show="renamingIcon !== null"
      preset="dialog"
      title="重命名图标"
      positive-text="保存"
      negative-text="取消"
      :positive-button-props="{ loading: isRenamingIcon }"
      @positive-click="submitRenameIcon"
      @negative-click="renamingIcon = null"
      @close="renamingIcon = null"
    >
      <NForm :show-feedback="false" @submit.prevent="submitRenameIcon">
        <NFormItem label="名称">
          <NInput v-model:value="renameIconName" placeholder="请输入图标名称" />
        </NFormItem>
      </NForm>
    </NModal>
  </main>
</template>
