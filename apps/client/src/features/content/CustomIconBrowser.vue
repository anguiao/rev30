<script setup lang="ts">
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { refDebounced } from '@vueuse/core'
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
  CustomIconSet,
  CustomIconSetListResponse,
  IconItem,
} from '@rev30/contracts'
import { useAuthStore } from '../../stores/auth'
import { saveFile } from '../../utils/download'
import { getErrorMessage } from '../../utils/error'
import IconGrid from './IconGrid.vue'
import IconSetFormDrawer from './IconSetFormDrawer.vue'
import IconUploadDrawer from './IconUploadDrawer.vue'
import {
  deleteCustomIcon,
  deleteCustomIconSet,
  exportCustomIconSet,
  listCustomIcons,
  listCustomIconSets,
  renameCustomIcon,
} from '.'

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
const iconQueryKeyword = refDebounced(
  computed(() => {
    const keyword = iconKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const selectedSet = ref<CustomIconSet | null>(null)
const selectedPrefix = computed(() => selectedSet.value?.prefix ?? null)

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
  isLoading: isLoadingIcons,
  hasNextPage,
  loadNextPage,
} = useInfiniteQuery<CustomIconListResponse, Error, string | null>({
  key: () => [
    'content',
    'icon-sets',
    'custom',
    'icons',
    iconListPageSize,
    iconQueryKeyword.value ?? '',
    selectedPrefix.value ?? '',
  ],
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
const iconErrorMessage = computed(() =>
  iconsError.value === null ? '' : getErrorMessage(iconsError.value, '加载自定义图标失败'),
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

async function invalidateIconSetQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'icon-sets', 'custom', 'sets'],
  })
}

async function invalidateIconQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'icon-sets', 'custom', 'icons'],
  })
}

const canRenameIcon = computed(() => auth.can('content:icon-set:update'))
const canDeleteIcon = computed(() => auth.can('content:icon-set:delete'))

const isIconSetDrawerVisible = ref(false)
const editingPrefix = ref<string | null>(null)
function openCreateSetDrawer() {
  editingPrefix.value = null
  isIconSetDrawerVisible.value = true
}
function openEditSetDrawer(iconSet: CustomIconSet) {
  editingPrefix.value = iconSet.prefix
  isIconSetDrawerVisible.value = true
}
async function handleSetSaved() {
  message.success('保存图标集成功')
  await invalidateIconSetQueries()
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
        await invalidateIconSetQueries()
        await invalidateIconQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除图标集失败'))
        return false
      }
    },
  })
}

const isUploadDrawerVisible = ref(false)
function openUploadDrawer() {
  if (selectedSet.value === null) {
    message.warning('请先选择自定义图标集')
    return
  }

  isUploadDrawerVisible.value = true
}
async function handleIconsUploaded() {
  message.success('上传图标成功')
  await invalidateIconSetQueries()
  await invalidateIconQueries()
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

const renamingIcon = ref<IconItem | null>(null)
const renameIconName = ref('')
const { isLoading: isRenamingIcon, ...renameIconMutation } = useMutation({
  mutation: ({ icon, name }: { icon: IconItem; name: string }) =>
    renameCustomIcon(icon.prefix, icon.name, { name }),
  async onSuccess() {
    message.success('重命名图标成功')
    renamingIcon.value = null
    await invalidateIconQueries()
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

  if (icon === null || nextName.length === 0 || isRenamingIcon.value) return

  renameIconMutation.mutate({ icon, name: nextName })
}

function confirmDeleteIcon(icon: IconItem) {
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
        await invalidateIconSetQueries()
        await invalidateIconQueries()
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

        <NInput
          v-model:value="setKeyword"
          data-test="custom-icon-set-filter"
          clearable
          placeholder="筛选图标集"
        />

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

        <NInfiniteScroll
          :key="iconScrollKey"
          data-test="custom-icon-scroll"
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
              :renamable="canRenameIcon"
              :deletable="canDeleteIcon"
              @copy="copyIcon"
              @copy-svg="copySvg"
              @rename="openRenameIconModal"
              @delete="confirmDeleteIcon"
            />
            <NEmpty v-else-if="!isLoadingIcons" />
            <div v-else class="h-40" />
          </NSpin>

          <div v-if="isLoadingIcons && icons.length > 0" class="flex justify-center py-4">
            <NSpin size="small" />
          </div>
        </NInfiniteScroll>
      </section>
    </section>

    <IconSetFormDrawer
      v-model:show="isIconSetDrawerVisible"
      :prefix="editingPrefix"
      @saved="handleSetSaved"
    />

    <IconUploadDrawer
      v-model:show="isUploadDrawerVisible"
      :prefix="selectedPrefix"
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
  </div>
</template>
