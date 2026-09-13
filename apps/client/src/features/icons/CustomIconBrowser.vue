<script setup lang="ts">
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { refDebounced, watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
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
  useDialog,
  useMessage,
} from 'naive-ui'
import type {
  CustomIconListResponse,
  CustomIconItem,
  CustomIconSet,
  CustomIconSetListResponse,
  CustomIconUpdateInput,
} from '@rev30/contracts'
import { customIconUpdateSchema } from '@rev30/contracts'
import { useDrawer } from '../../composables/useDrawer'
import { useAuthStore } from '../../stores/auth'
import { saveFile } from '../../utils/download'
import { getErrorMessage } from '../../utils/error'
import { ApiRequestError } from '../../utils/request'
import { refreshCustomIconCaches, resetInfiniteQuery } from './cache'
import IconGrid from './IconGrid.vue'
import IconKeywordsInput from './IconKeywordsInput.vue'
import { useIconSearchState } from './search-state'
import {
  deleteCustomIcon,
  deleteCustomIconSet,
  exportCustomIconSet,
  listCustomIcons,
  listCustomIconSets,
  updateCustomIcon,
} from './requests'

const props = defineProps<{
  active: boolean
}>()

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()
const auth = useAuthStore()
const filterDebounceMs = 250
const iconScrollLoadOffset = 160
const iconListPageSize = 80
const emptyIconSetListData: CustomIconSetListResponse = {
  list: [],
  total: 0,
}

const setKeyword = ref('')
const iconKeyword = ref('')
const setQueryKeyword = refDebounced(
  computed(() => {
    const keyword = setKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const iconQueryKeyword = ref<string | undefined>()
watchDebounced(
  iconKeyword,
  (value) => {
    const keyword = value.trim()
    iconQueryKeyword.value = keyword.length > 0 ? keyword : undefined
  },
  { debounce: filterDebounceMs },
)
watch(
  iconKeyword,
  (value) => {
    if (value.trim() === '') iconQueryKeyword.value = undefined
  },
  { flush: 'sync' },
)
const selectedSet = ref<CustomIconSet | null>(null)
const selectedPrefix = computed(() => selectedSet.value?.prefix ?? null)
const iconQueryKey = computed(() => [
  'content',
  'icon-sets',
  'custom',
  'icons',
  iconListPageSize,
  iconQueryKeyword.value ?? '',
  selectedPrefix.value ?? '',
])

watch(
  [iconQueryKey, () => props.active],
  ([key, active], [previousKey, wasActive]) => {
    if (active && (!wasActive || key.some((value, index) => value !== previousKey[index]))) {
      void resetInfiniteQuery(queryCache, key)
    }
  },
  { flush: 'sync' },
)

const {
  data: setsResponse,
  error: setsError,
  isLoading: isLoadingSets,
} = useQuery({
  key: () => ['content', 'icon-sets', 'custom', 'sets', setQueryKeyword.value ?? ''],
  enabled: () => props.active,
  placeholderData: () => emptyIconSetListData,
  query: () => listCustomIconSets({ keyword: setQueryKeyword.value }),
})

const {
  data: iconsResponse,
  error: iconsError,
  asyncStatus: iconsAsyncStatus,
  isLoading: isLoadingIcons,
  hasNextPage,
  loadNextPage,
  refetch: refetchIcons,
} = useInfiniteQuery<CustomIconListResponse, Error, string | null>({
  key: iconQueryKey,
  enabled: () => props.active,
  initialPageParam: null,
  query: ({ pageParam }) =>
    listCustomIcons({
      cursor: pageParam ?? undefined,
      pageSize: iconListPageSize,
      keyword: iconQueryKeyword.value,
      prefix: selectedPrefix.value ?? undefined,
    }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

const setsData = computed(() => setsResponse.value ?? emptyIconSetListData)
const icons = computed(() => (iconsResponse.value?.pages ?? []).flatMap((page) => page.list))
const iconScrollKey = computed(
  () => `${selectedPrefix.value ?? '__all__'}:${iconQueryKeyword.value ?? ''}:${iconListPageSize}`,
)
const setErrorMessage = computed(() =>
  setsError.value === null ? '' : getErrorMessage(setsError.value, '加载自定义图标集失败'),
)
const hasIconQuery = computed(() => iconQueryKeyword.value !== undefined)
const iconSearchState = useIconSearchState({
  error: iconsError,
  asyncStatus: iconsAsyncStatus,
  enabled: computed(() => props.active && hasIconQuery.value),
  refetch: refetchIcons,
})
const iconErrorMessage = computed(() =>
  iconSearchState.isOrdinaryError.value
    ? getErrorMessage(iconsError.value, '加载自定义图标失败')
    : '',
)
const emptyDescription = computed(() =>
  hasIconQuery.value ? '未找到匹配图标，可尝试英文名称、图标 ID 或其他关键词' : '暂无图标',
)

watch(setsData, (data) => {
  if (selectedSet.value === null) return

  selectedSet.value =
    data.list.find((iconSet) => iconSet.prefix === selectedSet.value?.prefix) ?? selectedSet.value
})

function selectSet(iconSet: CustomIconSet | null) {
  selectedSet.value = iconSet
}

async function loadMoreIcons() {
  if (isLoadingIcons.value || !hasNextPage.value) return

  await loadNextPage({ cancelRefetch: false })
}

watch(iconsError, (error) => {
  if (error instanceof ApiRequestError && error.code === 'INVALID_ICON_CURSOR') {
    void resetInfiniteQuery(queryCache, iconQueryKey.value)
  }
})

const canEditIcon = computed(() => auth.can('content:icon-set:update'))
const canDeleteIcon = computed(() => auth.can('content:icon-set:delete'))

const {
  component: IconSetFormDrawer,
  hasOpened: hasOpenedIconSetDrawer,
  visible: isIconSetDrawerVisible,
  open: showIconSetDrawer,
} = useDrawer(() => import('./IconSetFormDrawer.vue'))
const editingPrefix = ref<string | null>(null)
function openCreateSetDrawer() {
  editingPrefix.value = null
  showIconSetDrawer()
}
function openEditSetDrawer(iconSet: CustomIconSet) {
  editingPrefix.value = iconSet.prefix
  showIconSetDrawer()
}
async function handleSetSaved() {
  message.success('保存图标集成功')
}

function confirmDeleteSet(iconSet: CustomIconSet) {
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

        if (selectedPrefix.value === iconSet.prefix) {
          selectedSet.value = null
        }

        message.success('删除图标集成功')
        void refreshCustomIconCaches(queryCache)
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标集失败'))
        return false
      }
    },
  })
}

const {
  component: IconUploadDrawer,
  hasOpened: hasOpenedUploadDrawer,
  visible: isUploadDrawerVisible,
  open: showUploadDrawer,
} = useDrawer(() => import('./IconUploadDrawer.vue'))
function openUploadDrawer() {
  if (selectedSet.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  showUploadDrawer()
}
async function handleIconsUploaded() {
  message.success('上传图标成功')
}

async function exportSelectedSet() {
  if (selectedSet.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  try {
    const file = await exportCustomIconSet(selectedSet.value.prefix)
    saveFile(file.blob, file.filename)
    message.success('导出图标集成功')
  } catch (error) {
    message.error(getErrorMessage(error, '导出图标集失败'))
  }
}

const editingIcon = ref<CustomIconItem | null>(null)
const editIconName = ref('')
const editIconKeywords = ref<string[]>([])
const editIconError = ref<string | null>(null)
const editIconSessionId = ref(0)
const { isLoading: isEditingIcon, ...editIconMutation } = useMutation({
  mutation: ({
    icon,
    input,
  }: {
    icon: CustomIconItem
    input: CustomIconUpdateInput
    sessionId: number
  }) => updateCustomIcon(icon.prefix, icon.name, input),
  onSuccess(_, { sessionId }) {
    void refreshCustomIconCaches(queryCache)

    if (sessionId !== editIconSessionId.value || editingIcon.value === null) return

    message.success('编辑图标成功')
    editingIcon.value = null
  },
  onError(error, { sessionId }) {
    if (sessionId !== editIconSessionId.value || editingIcon.value === null) return

    editIconError.value = getErrorMessage(error, '编辑图标失败')
  },
})
function openEditIconModal(icon: CustomIconItem) {
  editIconSessionId.value += 1
  editingIcon.value = icon
  editIconName.value = icon.name
  editIconKeywords.value = [...icon.keywords]
  editIconError.value = null
}
function closeEditIconModal() {
  editIconSessionId.value += 1
  editingIcon.value = null
  editIconError.value = null
}
function submitEditIcon() {
  const icon = editingIcon.value
  const result = customIconUpdateSchema.safeParse({
    name: editIconName.value.trim(),
    keywords: editIconKeywords.value,
  })

  if (icon === null || isEditingIcon.value) return
  if (!result.success) {
    editIconError.value = result.error.issues[0]?.message ?? '图标信息无效'
    return
  }

  editIconError.value = null
  editIconMutation.mutate({
    icon,
    input: result.data,
    sessionId: editIconSessionId.value,
  })
}

function confirmDeleteIcon(icon: CustomIconItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
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
        void refreshCustomIconCaches(queryCache)
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标失败'))
        return false
      }
    },
  })
}

async function copyIcon(icon: string) {
  await navigator.clipboard.writeText(icon)
  message.success('已复制图标名称')
}

async function copySvg(svg: string) {
  await navigator.clipboard.writeText(svg)
  message.success('已复制 SVG')
}
</script>

<template>
  <div class="space-y-5 pt-4">
    <NAlert v-if="setErrorMessage" type="error">{{ setErrorMessage }}</NAlert>
    <NAlert v-if="iconErrorMessage" type="error">{{ iconErrorMessage }}</NAlert>

    <section class="grid min-h-0 gap-5 xl:h-[calc(100vh-12rem)] xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside
        class="flex max-h-[calc(100vh-12rem)] min-h-0 flex-col gap-2 rounded-ui border border-stone-200 bg-white p-3 xl:h-full xl:max-h-none dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">自定义图标集</div>
            <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
              共 {{ setsData.total }} 个
            </div>
          </div>
          <NButton
            v-can="'content:icon-set:create'"
            data-test="custom-icon-set-create"
            type="primary"
            size="small"
            @click="openCreateSetDrawer"
          >
            <template #icon>
              <span class="i-[lucide--plus]" aria-hidden="true" />
            </template>
            创建
          </NButton>
        </div>

        <NInput v-model:value="setKeyword" clearable placeholder="筛选图标集" />

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <NSpin :show="isLoadingSets">
            <div class="space-y-0.5">
              <button
                type="button"
                class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
                :class="
                  selectedSet === null
                    ? 'bg-primary/5 text-primary'
                    : 'text-stone-700 hover:bg-stone-50 dark:text-zinc-200 dark:hover:bg-zinc-800'
                "
                @click="selectSet(null)"
              >
                <div class="truncate text-sm font-medium">全部自定义</div>
                <div class="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
                  {{ setsData.total }} 个图标集
                </div>
              </button>

              <div
                v-for="iconSet in setsData.list"
                :key="iconSet.prefix"
                class="rounded-ui px-2.5 py-1.5 transition-colors"
                :class="
                  selectedPrefix === iconSet.prefix
                    ? 'bg-primary/5'
                    : 'hover:bg-stone-50 dark:hover:bg-zinc-800'
                "
              >
                <div class="flex min-w-0 items-start justify-between gap-1">
                  <button
                    type="button"
                    data-test="custom-icon-set"
                    class="min-w-0 flex-1 text-left"
                    @click="selectSet(iconSet)"
                  >
                    <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
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
                      @click.stop="openEditSetDrawer(iconSet)"
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
                      @click.stop="confirmDeleteSet(iconSet)"
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
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
              {{ selectedSet?.name ?? '全部自定义图标集' }}
            </div>
            <div class="mt-1 truncate text-xs text-stone-500 dark:text-zinc-400">
              {{ selectedPrefix ?? `${setsData.total} 个图标集` }}
            </div>
          </div>

          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <NInput
              v-model:value="iconKeyword"
              data-test="custom-icon-filter"
              clearable
              placeholder="搜索中英文名称和关键词"
              class="w-full sm:w-72!"
            />
            <div
              class="flex items-center gap-1 sm:border-l sm:border-stone-200 sm:pl-2 dark:sm:border-zinc-800"
            >
              <NButton
                v-can="'content:icon-set:create'"
                data-test="custom-icon-set-upload"
                type="primary"
                :disabled="selectedSet === null"
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
                :disabled="selectedSet === null"
                @click="exportSelectedSet"
              >
                <template #icon>
                  <span class="i-[lucide--download]" aria-hidden="true" />
                </template>
                导出
              </NButton>
            </div>
          </div>
        </div>

        <div class="shrink-0 px-4 pt-3 text-xs text-stone-500 dark:text-zinc-400">
          支持中英文名称和关键词。部分内置图标支持中文，可尝试英文名称或图标 ID。
        </div>

        <NAlert
          v-if="iconSearchState.isPreparing.value"
          type="info"
          :show-icon="false"
          class="mx-4 mt-3"
        >
          图标搜索正在准备
        </NAlert>
        <NAlert
          v-else-if="iconSearchState.isUnavailable.value"
          type="warning"
          :show-icon="false"
          class="mx-4 mt-3"
        >
          图标搜索暂不可用
        </NAlert>

        <NInfiniteScroll
          :key="iconScrollKey"
          class="min-h-0 flex-1"
          :distance="iconScrollLoadOffset"
          :scrollbar-props="{ contentClass: 'p-4' }"
          @load="loadMoreIcons"
        >
          <NSpin :show="isLoadingIcons && icons.length === 0">
            <IconGrid
              v-if="icons.length > 0"
              :icons="icons"
              :scope="selectedSet === null ? 'all' : 'single'"
              :renamable="canEditIcon"
              :deletable="canDeleteIcon"
              @copy="copyIcon"
              @copy-svg="copySvg"
              @rename="openEditIconModal"
              @delete="confirmDeleteIcon"
            />
            <NEmpty
              v-else-if="
                !isLoadingIcons &&
                !iconSearchState.isPreparing.value &&
                !iconSearchState.isUnavailable.value &&
                !iconErrorMessage
              "
              :description="emptyDescription"
            />
            <div v-else class="h-40" />
          </NSpin>

          <div v-if="isLoadingIcons && icons.length > 0" class="flex justify-center py-4">
            <NSpin size="small" />
          </div>
        </NInfiniteScroll>
      </section>
    </section>

    <IconSetFormDrawer
      v-if="hasOpenedIconSetDrawer"
      v-model:show="isIconSetDrawerVisible"
      :prefix="editingPrefix"
      @saved="handleSetSaved"
    />

    <IconUploadDrawer
      v-if="hasOpenedUploadDrawer"
      v-model:show="isUploadDrawerVisible"
      :prefix="selectedPrefix"
      @uploaded="handleIconsUploaded"
    />

    <NModal
      :show="editingIcon !== null"
      preset="dialog"
      title="编辑图标"
      positive-text="保存"
      negative-text="取消"
      :positive-button-props="{ loading: isEditingIcon }"
      @positive-click="submitEditIcon"
      @negative-click="closeEditIconModal"
      @close="closeEditIconModal"
    >
      <NForm :show-feedback="false" @submit.prevent="submitEditIcon">
        <NAlert v-if="editIconError" type="error" :show-icon="false" class="mb-3">
          {{ editIconError }}
        </NAlert>
        <NFormItem label="名称">
          <NInput v-model:value="editIconName" placeholder="请输入图标名称" />
        </NFormItem>
        <NFormItem label="关键词">
          <IconKeywordsInput v-model="editIconKeywords" @clear="editIconKeywords = []" />
        </NFormItem>
      </NForm>
    </NModal>
  </div>
</template>
