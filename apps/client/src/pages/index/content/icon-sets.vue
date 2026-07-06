<script setup lang="ts">
import { computed, ref, type HTMLAttributes } from 'vue'
import { refDebounced } from '@vueuse/core'
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type { ButtonProps } from 'naive-ui'
import {
  NAlert,
  NButton,
  NEmpty,
  NForm,
  NFormItem,
  NInfiniteScroll,
  NInput,
  NModal,
  NSpin,
  NTabPane,
  NTabs,
  useDialog,
  useMessage,
} from 'naive-ui'
import type {
  BuiltinIconListResponse,
  BuiltinIconSetItem,
  CustomIconListResponse,
  CustomIconSet,
  IconItem,
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
import { saveFile } from '../../../utils/download'

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
const iconScrollLoadOffset = 160
const iconListPageSize = 80

const emptyIconSetListData = {
  list: [],
  total: 0,
}

async function copyIcon(icon: string) {
  await navigator.clipboard.writeText(icon)
  message.success('已复制图标名称')
}

async function copySvg(svg: string) {
  await navigator.clipboard.writeText(svg)
  message.success('已复制 SVG')
}

const builtinSetKeyword = ref('')
const builtinIconKeyword = ref('')
const builtinSetQueryKeyword = refDebounced(
  computed(() => {
    const keyword = builtinSetKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const builtinIconQueryKeyword = refDebounced(
  computed(() => {
    const keyword = builtinIconKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const selectedBuiltinPrefix = ref<string | null>(null)

const {
  data: builtinSetsResponse,
  error: builtinSetsError,
  isLoading: isLoadingBuiltinSets,
} = useQuery({
  key: () => ['content', 'icon-sets', 'builtin', 'sets', builtinSetQueryKeyword.value ?? ''],
  enabled: () => activeTab.value === 'builtin',
  placeholderData: () => emptyIconSetListData,
  query: () => listBuiltinIconSets({ keyword: builtinSetQueryKeyword.value }),
})

const {
  data: builtinIconsResponse,
  error: builtinIconsError,
  isLoading: isLoadingBuiltinIcons,
  hasNextPage: hasNextBuiltinIconPage,
  loadNextPage: loadNextBuiltinIconPage,
} = useInfiniteQuery<BuiltinIconListResponse, Error, string | null>({
  key: () => [
    'content',
    'icon-sets',
    'builtin',
    'icons',
    iconListPageSize,
    builtinIconQueryKeyword.value ?? '',
    selectedBuiltinPrefix.value ?? '',
  ],
  enabled: () => activeTab.value === 'builtin',
  initialPageParam: null,
  query: ({ pageParam }) =>
    listBuiltinIcons({
      cursor: pageParam ?? undefined,
      pageSize: iconListPageSize,
      keyword: builtinIconQueryKeyword.value,
      prefix: selectedBuiltinPrefix.value ?? undefined,
    }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

const builtinSetsData = computed(() => builtinSetsResponse.value ?? emptyIconSetListData)
const builtinIcons = computed(() =>
  (builtinIconsResponse.value?.pages ?? []).flatMap((page) => page.list),
)
const selectedBuiltinSet = computed(
  () =>
    builtinSetsData.value.list.find((iconSet) => iconSet.prefix === selectedBuiltinPrefix.value) ??
    null,
)
const builtinIconScrollKey = computed(
  () =>
    `${selectedBuiltinPrefix.value ?? '__all__'}:${builtinIconQueryKeyword.value ?? ''}:${iconListPageSize}`,
)
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

function selectBuiltinSet(iconSet: BuiltinIconSetItem | null) {
  selectedBuiltinPrefix.value = iconSet?.prefix ?? null
}

async function loadMoreBuiltinIcons() {
  if (isLoadingBuiltinIcons.value || !hasNextBuiltinIconPage.value) {
    return
  }

  await loadNextBuiltinIconPage({ cancelRefetch: false })
}

const customSetKeyword = ref('')
const customIconKeyword = ref('')
const customSetQueryKeyword = refDebounced(
  computed(() => {
    const keyword = customSetKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const customIconQueryKeyword = refDebounced(
  computed(() => {
    const keyword = customIconKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const selectedCustomPrefix = ref<string | null>(null)

const {
  data: customSetsResponse,
  error: customSetsError,
  isLoading: isLoadingCustomSets,
} = useQuery({
  key: () => ['content', 'icon-sets', 'custom', 'sets', customSetQueryKeyword.value ?? ''],
  enabled: () => activeTab.value === 'custom',
  placeholderData: () => emptyIconSetListData,
  query: () => listCustomIconSets({ keyword: customSetQueryKeyword.value }),
})

const {
  data: customIconsResponse,
  error: customIconsError,
  isLoading: isLoadingCustomIcons,
  hasNextPage: hasNextCustomIconPage,
  loadNextPage: loadNextCustomIconPage,
} = useInfiniteQuery<CustomIconListResponse, Error, string | null>({
  key: () => [
    'content',
    'icon-sets',
    'custom',
    'icons',
    iconListPageSize,
    customIconQueryKeyword.value ?? '',
    selectedCustomPrefix.value ?? '',
  ],
  enabled: () => activeTab.value === 'custom',
  initialPageParam: null,
  query: ({ pageParam }) =>
    listCustomIcons({
      cursor: pageParam ?? undefined,
      pageSize: iconListPageSize,
      keyword: customIconQueryKeyword.value,
      prefix: selectedCustomPrefix.value ?? undefined,
    }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

const customSetsData = computed(() => customSetsResponse.value ?? emptyIconSetListData)
const customIcons = computed(() =>
  (customIconsResponse.value?.pages ?? []).flatMap((page) => page.list),
)
const selectedCustomSet = computed(
  () =>
    customSetsData.value.list.find((iconSet) => iconSet.prefix === selectedCustomPrefix.value) ??
    null,
)
const customIconScrollKey = computed(
  () =>
    `${selectedCustomPrefix.value ?? '__all__'}:${customIconQueryKeyword.value ?? ''}:${iconListPageSize}`,
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

function selectCustomSet(iconSet: CustomIconSet | null) {
  selectedCustomPrefix.value = iconSet?.prefix ?? null
}

async function loadMoreCustomIcons() {
  if (isLoadingCustomIcons.value || !hasNextCustomIconPage.value) {
    return
  }

  await loadNextCustomIconPage({ cancelRefetch: false })
}

async function invalidateCustomIconSetQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'icon-sets', 'custom', 'sets'],
  })
}

async function invalidateCustomIconQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'icon-sets', 'custom', 'icons'],
  })
}

const canRenameCustomIcon = computed(() => auth.can('content:icon-set:update'))
const canDeleteCustomIcon = computed(() => auth.can('content:icon-set:delete'))

const isIconSetDrawerVisible = ref(false)
const editingCustomPrefix = ref<string | null>(null)
function openCreateCustomSetDrawer() {
  editingCustomPrefix.value = null
  isIconSetDrawerVisible.value = true
}
function openEditCustomSetDrawer(iconSet: CustomIconSet) {
  editingCustomPrefix.value = iconSet.prefix
  isIconSetDrawerVisible.value = true
}
async function handleCustomSetSaved() {
  message.success('保存图标集成功')
  await invalidateCustomIconSetQueries()
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
        }

        message.success('删除图标集成功')
        await invalidateCustomIconSetQueries()
        await invalidateCustomIconQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标集失败'))
        return false
      }
    },
  })
}

const isUploadDrawerVisible = ref(false)
function openUploadDrawer() {
  if (selectedCustomPrefix.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  isUploadDrawerVisible.value = true
}
async function handleIconsUploaded() {
  message.success('上传图标成功')
  await invalidateCustomIconSetQueries()
  await invalidateCustomIconQueries()
}

async function exportSelectedCustomSet() {
  if (selectedCustomPrefix.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  try {
    const file = await exportCustomIconSet(selectedCustomPrefix.value)
    saveFile(file.blob, file.filename)
    message.success('导出图标集成功')
  } catch (error) {
    message.error(getErrorMessage(error, '导出图标集失败'))
  }
}

const renamingIcon = ref<IconItem | null>(null)
const renameIconName = ref('')
const { isLoading: isRenamingIcon, ...renameIconMutation } = useMutation({
  mutation: ({ icon, name }: { icon: IconItem; name: string }) =>
    renameCustomIcon(icon.prefix, icon.name, { name }),
  async onSuccess() {
    message.success('重命名图标成功')
    renamingIcon.value = null
    await invalidateCustomIconQueries()
  },
  onError(error) {
    message.error(getErrorMessage(error, '重命名图标失败'))
  },
})
function openRenameIconModal(icon: IconItem) {
  renamingIcon.value = icon
  renameIconName.value = icon.name
}
function submitRenameIcon() {
  const icon = renamingIcon.value
  const nextName = renameIconName.value.trim()

  if (icon === null || nextName.length === 0 || isRenamingIcon.value) {
    return
  }

  renameIconMutation.mutate({ icon, name: nextName })
}

function confirmDeleteCustomIcon(icon: IconItem) {
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
        await invalidateCustomIconQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标失败'))
        return false
      }
    },
  })
}
</script>

<template>
  <main>
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
    </header>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="builtin" tab="内置图标" :tab-props="builtinTabProps">
        <div class="space-y-5 pt-4">
          <NAlert v-if="builtinSetErrorMessage" type="error">{{ builtinSetErrorMessage }}</NAlert>
          <NAlert v-if="builtinIconErrorMessage" type="error">{{ builtinIconErrorMessage }}</NAlert>

          <section
            class="grid min-h-0 gap-5 xl:h-[calc(100vh-12rem)] xl:grid-cols-[15rem_minmax(0,1fr)]"
          >
            <aside
              class="flex max-h-[calc(100vh-12rem)] min-h-0 flex-col gap-2 rounded-ui border border-stone-200 bg-white p-3 xl:h-full xl:max-h-none dark:border-zinc-800 dark:bg-zinc-900"
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

              <div class="min-h-0 flex-1 overflow-y-auto pr-1">
                <NSpin :show="isLoadingBuiltinSets">
                  <div class="space-y-0.5">
                    <button
                      type="button"
                      class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
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
                      class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
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
                  </div>
                </NSpin>
              </div>
            </aside>

            <section
              class="flex min-h-0 flex-col rounded-ui border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div
                class="flex shrink-0 flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"
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

              <NInfiniteScroll
                :key="builtinIconScrollKey"
                data-test="builtin-icon-scroll"
                class="min-h-0 flex-1"
                :distance="iconScrollLoadOffset"
                :scrollbar-props="{ contentClass: 'p-4' }"
                @load="loadMoreBuiltinIcons"
              >
                <NSpin :show="isLoadingBuiltinIcons && builtinIcons.length === 0">
                  <IconGrid
                    v-if="builtinIcons.length > 0"
                    :icons="builtinIcons"
                    :scope="selectedBuiltinPrefix === null ? 'all' : 'single'"
                    @copy="copyIcon"
                    @copy-svg="copySvg"
                  />
                  <NEmpty v-else-if="!isLoadingBuiltinIcons" />
                  <div v-else class="h-40" />
                </NSpin>

                <div
                  v-if="isLoadingBuiltinIcons && builtinIcons.length > 0"
                  class="flex justify-center py-4"
                >
                  <NSpin size="small" />
                </div>
              </NInfiniteScroll>
            </section>
          </section>
        </div>
      </NTabPane>

      <NTabPane name="custom" tab="自定义图标" :tab-props="customTabProps">
        <div class="space-y-5 pt-4">
          <NAlert v-if="customSetErrorMessage" type="error">{{ customSetErrorMessage }}</NAlert>
          <NAlert v-if="customIconErrorMessage" type="error">{{ customIconErrorMessage }}</NAlert>

          <section
            class="grid min-h-0 gap-5 xl:h-[calc(100vh-12rem)] xl:grid-cols-[15rem_minmax(0,1fr)]"
          >
            <aside
              class="flex max-h-[calc(100vh-12rem)] min-h-0 flex-col gap-2 rounded-ui border border-stone-200 bg-white p-3 xl:h-full xl:max-h-none dark:border-zinc-800 dark:bg-zinc-900"
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
                  <template #icon>
                    <span class="i-[lucide--plus]" aria-hidden="true" />
                  </template>
                  创建
                </NButton>
              </div>

              <NInput
                v-model:value="customSetKeyword"
                data-test="custom-icon-set-filter"
                clearable
                placeholder="筛选图标集"
              />

              <div class="min-h-0 flex-1 overflow-y-auto pr-1">
                <NSpin :show="isLoadingCustomSets">
                  <div class="space-y-0.5">
                    <button
                      type="button"
                      class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
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
                      class="rounded-ui px-2.5 py-1.5 transition-colors"
                      :class="
                        selectedCustomPrefix === iconSet.prefix
                          ? 'bg-primary/5'
                          : 'hover:bg-stone-50 dark:hover:bg-zinc-800'
                      "
                    >
                      <div class="flex min-w-0 items-start justify-between gap-1">
                        <button
                          type="button"
                          data-test="custom-icon-set"
                          class="min-w-0 flex-1 text-left"
                          @click="selectCustomSet(iconSet)"
                        >
                          <div
                            class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100"
                          >
                            {{ iconSet.name }}
                          </div>
                          <div class="mt-0.5 truncate text-xs text-stone-500 dark:text-zinc-400">
                            {{ iconSet.iconCount }} 个图标 / {{ iconSet.prefix }}
                          </div>
                        </button>

                        <div class="flex shrink-0 items-center">
                          <NButton
                            v-can="'content:icon-set:update'"
                            quaternary
                            circle
                            size="tiny"
                            title="编辑"
                            aria-label="编辑图标集"
                            @click.stop="openEditCustomSetDrawer(iconSet)"
                          >
                            <span class="i-[lucide--pencil-line] text-xs" aria-hidden="true" />
                          </NButton>

                          <NButton
                            v-can="'content:icon-set:delete'"
                            quaternary
                            circle
                            size="tiny"
                            title="删除"
                            aria-label="删除图标集"
                            @click.stop="confirmDeleteCustomSet(iconSet)"
                          >
                            <span class="i-[lucide--trash-2] text-xs" aria-hidden="true" />
                          </NButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </NSpin>
              </div>
            </aside>

            <section
              class="flex min-h-0 flex-col rounded-ui border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div
                class="flex shrink-0 flex-col gap-3 border-b border-stone-100 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800"
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

                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <NInput
                    v-model:value="customIconKeyword"
                    data-test="custom-icon-filter"
                    clearable
                    placeholder="筛选图标"
                    class="w-full sm:w-72!"
                  />
                  <div
                    class="flex items-center gap-1 sm:border-l sm:border-stone-200 sm:pl-2 dark:sm:border-zinc-800"
                  >
                    <NButton
                      v-can="'content:icon-set:create'"
                      data-test="custom-icon-set-upload"
                      type="primary"
                      :disabled="selectedCustomPrefix === null"
                      @click="openUploadDrawer"
                    >
                      <template #icon>
                        <span class="i-[lucide--upload]" aria-hidden="true" />
                      </template>
                      上传
                    </NButton>
                    <NButton
                      v-can="'content:icon-set:export'"
                      data-test="custom-icon-set-export"
                      tertiary
                      :disabled="selectedCustomPrefix === null"
                      @click="exportSelectedCustomSet"
                    >
                      <template #icon>
                        <span class="i-[lucide--download]" aria-hidden="true" />
                      </template>
                      导出
                    </NButton>
                  </div>
                </div>
              </div>

              <NInfiniteScroll
                :key="customIconScrollKey"
                data-test="custom-icon-scroll"
                class="min-h-0 flex-1"
                :distance="iconScrollLoadOffset"
                :scrollbar-props="{ contentClass: 'p-4' }"
                @load="loadMoreCustomIcons"
              >
                <NSpin :show="isLoadingCustomIcons && customIcons.length === 0">
                  <IconGrid
                    v-if="customIcons.length > 0"
                    :icons="customIcons"
                    :scope="selectedCustomPrefix === null ? 'all' : 'single'"
                    :renamable="canRenameCustomIcon"
                    :deletable="canDeleteCustomIcon"
                    @copy="copyIcon"
                    @copy-svg="copySvg"
                    @rename="openRenameIconModal"
                    @delete="confirmDeleteCustomIcon"
                  />
                  <NEmpty v-else-if="!isLoadingCustomIcons" />
                  <div v-else class="h-40" />
                </NSpin>

                <div
                  v-if="isLoadingCustomIcons && customIcons.length > 0"
                  class="flex justify-center py-4"
                >
                  <NSpin size="small" />
                </div>
              </NInfiniteScroll>
            </section>
          </section>
        </div>
      </NTabPane>
    </NTabs>

    <IconSetFormDrawer
      v-model:show="isIconSetDrawerVisible"
      :prefix="editingCustomPrefix"
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
