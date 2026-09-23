<script setup lang="ts">
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, onActivated, onDeactivated, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NEmpty,
  NInfiniteScroll,
  NInput,
  NSpin,
  useDialog,
  useMessage,
  type ButtonProps,
} from 'naive-ui'
import type {
  BuiltinIconSetItem,
  BuiltinIconSetListResponse,
  CustomIconItem,
  CustomIconSet,
  CustomIconSetListResponse,
  IconItem,
} from '@rev30/contracts'
import { useDrawer } from '../../../composables/useDrawer'
import { useAuthStore } from '../../../stores/auth'
import { saveFile } from '../../../utils/download'
import { getErrorMessage } from '../../../utils/error'
import { refreshCustomIconCaches } from '../cache'
import {
  deleteCustomIcon,
  deleteCustomIconSet,
  exportCustomIconSet,
  listBuiltinIconSets,
  listCustomIconSets,
} from '../requests'
import IconGrid from './IconGrid.vue'
import IconSearchFeedback from '../search/IconSearchFeedback.vue'
import { useIconList } from './useIconList'
import { useIconSearchKeyword } from '../search/useIconSearchKeyword'

const props = defineProps<{
  source: 'builtin' | 'custom'
}>()

const isActive = ref(true)
onActivated(() => {
  isActive.value = true
})
onDeactivated(() => {
  isActive.value = false
})

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()
const auth = useAuthStore()
const sourceName = computed(() => (props.source === 'builtin' ? '内置' : '自定义'))
const selectedSet = ref<BuiltinIconSetItem | CustomIconSet | null>(null)
const selectedPrefix = computed(() => selectedSet.value?.prefix ?? null)
const canEditIcon = computed(() => props.source === 'custom' && auth.can('content:icon-set:update'))
const canDeleteIcon = computed(
  () => props.source === 'custom' && auth.can('content:icon-set:delete'),
)

const { keyword: setKeyword, queryKeyword: setQueryKeyword } = useIconSearchKeyword()
const {
  data: setsResponse,
  error: setsError,
  isLoading: isLoadingSets,
  refetch: refetchSets,
} = useQuery<BuiltinIconSetListResponse | CustomIconSetListResponse>({
  key: () => ['content', 'icon-sets', props.source, 'sets', setQueryKeyword.value],
  enabled: isActive,
  query: () => {
    const query = props.source === 'builtin' ? listBuiltinIconSets : listCustomIconSets
    return query({ keyword: setQueryKeyword.value || undefined })
  },
})
const sets = computed(() => setsResponse.value?.list ?? [])
const totalSets = computed(() => setsResponse.value?.total ?? 0)
const setErrorMessage = computed(() =>
  setsError.value === null
    ? ''
    : getErrorMessage(setsError.value, `加载${sourceName.value}图标集失败`),
)

watch(sets, (items) => {
  if (selectedSet.value === null) return

  const current = items.find((item) => item.prefix === selectedPrefix.value)
  if (current !== undefined) selectedSet.value = current
})

const { keyword, icons, error, isLoading, hasSearchKeyword, scrollKey, retry, loadMore } =
  useIconList({
    source: () => props.source,
    active: isActive,
    prefix: selectedPrefix,
  })
const emptyDescription = computed(() =>
  hasSearchKeyword.value ? '未找到匹配图标，请尝试其他关键词' : '暂无图标',
)

async function copy(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.success(successMessage)
  } catch {
    message.error('复制失败，请重试')
  }
}

const {
  component: IconSetFormDrawer,
  hasOpened: hasOpenedSetDrawer,
  visible: isSetDrawerVisible,
  open: showSetDrawer,
} = useDrawer(() => import('../forms/IconSetFormDrawer.vue'))
const editingPrefix = ref<string | null>(null)
function openSetFormDrawer(prefix: string | null = null) {
  editingPrefix.value = prefix
  showSetDrawer()
}

function confirmDeleteSet(iconSet: BuiltinIconSetItem | CustomIconSet) {
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
} = useDrawer(() => import('../forms/IconUploadDrawer.vue'))

async function exportSelectedSet() {
  if (selectedPrefix.value === null) return

  try {
    const file = await exportCustomIconSet(selectedPrefix.value)
    saveFile(file.blob, file.filename)
    message.success('导出图标集成功')
  } catch (error) {
    message.error(getErrorMessage(error, '导出图标集失败'))
  }
}

const {
  component: IconFormDrawer,
  hasOpened: hasOpenedIconDrawer,
  visible: isIconDrawerVisible,
  open: showIconDrawer,
} = useDrawer(() => import('../forms/IconFormDrawer.vue'))
const editingIcon = ref<CustomIconItem | null>(null)
function openIconFormDrawer(icon: IconItem | CustomIconItem) {
  if ('keywords' in icon) {
    editingIcon.value = icon
    showIconDrawer()
  }
}

function confirmDeleteIcon(icon: IconItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除图标“${icon.icon}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' },
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
</script>

<template>
  <section
    class="grid min-h-0 gap-5 pt-4 xl:h-[calc(100vh-12rem)] xl:grid-cols-[15rem_minmax(0,1fr)]"
  >
    <aside
      class="flex max-h-[calc(100vh-12rem)] min-h-0 flex-col gap-2 rounded-ui border border-stone-200 bg-white p-3 xl:h-full xl:max-h-none dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">
            {{ sourceName }}图标集
          </div>
          <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">共 {{ totalSets }} 个</div>
        </div>
        <NButton
          v-if="source === 'custom'"
          v-can="'content:icon-set:create'"
          data-test="custom-icon-set-create"
          type="primary"
          size="small"
          @click="openSetFormDrawer()"
        >
          <template #icon><span class="i-[lucide--plus]" aria-hidden="true" /></template>
          创建
        </NButton>
      </div>

      <NInput
        v-model:value="setKeyword"
        :data-test="`${source}-icon-set-filter`"
        clearable
        placeholder="筛选图标集"
      />
      <NAlert v-if="setsError" type="error" :show-icon="false">
        {{ setErrorMessage }}
        <NButton text size="small" :loading="isLoadingSets" @click="refetchSets()">重试</NButton>
      </NAlert>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <NSpin :show="isLoadingSets">
          <div class="space-y-0.5">
            <button
              type="button"
              :data-test="`${source}-icon-set-all`"
              :aria-pressed="selectedSet === null"
              class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
              :class="
                selectedSet === null
                  ? 'bg-primary/5 text-primary'
                  : 'text-stone-700 hover:bg-stone-50 dark:text-zinc-200 dark:hover:bg-zinc-800'
              "
              @click="selectedSet = null"
            >
              <div class="truncate text-sm font-medium">全部{{ sourceName }}</div>
              <div class="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">跨图标集浏览与搜索</div>
            </button>

            <div
              v-for="iconSet in sets"
              :key="iconSet.prefix"
              class="flex min-w-0 items-start justify-between gap-1 rounded-ui px-2.5 py-1.5 transition-colors"
              :class="
                selectedPrefix === iconSet.prefix
                  ? 'bg-primary/5'
                  : 'hover:bg-stone-50 dark:hover:bg-zinc-800'
              "
            >
              <button
                type="button"
                :data-test="`${source}-icon-set`"
                :aria-pressed="selectedPrefix === iconSet.prefix"
                class="min-w-0 flex-1 text-left"
                @click="selectedSet = iconSet"
              >
                <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
                  {{ iconSet.name }}
                </div>
                <div class="mt-0.5 truncate text-xs text-stone-500 dark:text-zinc-400">
                  {{ 'iconCount' in iconSet ? iconSet.iconCount : iconSet.total }} 个图标
                  <template v-if="source === 'custom'"> / {{ iconSet.prefix }}</template>
                </div>
              </button>
              <div v-if="source === 'custom'" class="flex shrink-0 items-center">
                <NButton
                  v-can="'content:icon-set:update'"
                  quaternary
                  circle
                  size="tiny"
                  title="编辑"
                  aria-label="编辑图标集"
                  @click="openSetFormDrawer(iconSet.prefix)"
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
                  @click="confirmDeleteSet(iconSet)"
                >
                  <span class="i-[lucide--trash-2] text-xs" aria-hidden="true" />
                </NButton>
              </div>
            </div>
            <NEmpty
              v-if="sets.length === 0 && !isLoadingSets && !setsError"
              :description="setQueryKeyword ? '未找到匹配图标集' : '暂无图标集'"
              class="py-6"
            />
          </div>
        </NSpin>
      </div>
    </aside>

    <section
      class="flex min-h-0 min-w-0 flex-col rounded-ui border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div
        class="flex shrink-0 flex-col gap-3 border-b border-stone-100 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800"
      >
        <div class="min-w-0">
          <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
            {{ selectedSet?.name ?? `全部${sourceName}图标集` }}
          </div>
          <div class="mt-1 truncate text-xs text-stone-500 dark:text-zinc-400">
            {{ selectedPrefix ?? '跨图标集浏览与搜索' }}
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <NInput
            v-model:value="keyword"
            :data-test="`${source}-icon-filter`"
            clearable
            placeholder="搜索图标，支持中英文"
            class="w-full sm:w-72!"
          />
          <div
            v-if="source === 'custom'"
            class="flex items-center gap-1 sm:border-l sm:border-stone-200 sm:pl-2 dark:sm:border-zinc-800"
          >
            <NButton
              v-can="'content:icon-set:create'"
              data-test="custom-icon-set-upload"
              type="primary"
              :disabled="selectedSet === null"
              @click="showUploadDrawer"
            >
              <template #icon><span class="i-[lucide--upload]" aria-hidden="true" /></template>
              上传
            </NButton>
            <NButton
              v-can="'content:icon-set:export'"
              data-test="custom-icon-set-export"
              tertiary
              :disabled="selectedSet === null"
              @click="exportSelectedSet"
            >
              <template #icon><span class="i-[lucide--download]" aria-hidden="true" /></template>
              导出
            </NButton>
          </div>
        </div>
      </div>

      <IconSearchFeedback
        :error="error"
        :loading="isLoading"
        class="mx-4 mt-3 shrink-0"
        @retry="retry"
      />

      <NInfiniteScroll
        :key="scrollKey"
        :data-test="`${source}-icon-scroll`"
        class="min-h-0 flex-1"
        :distance="160"
        :scrollbar-props="{ contentClass: 'p-4' }"
        @load="loadMore"
      >
        <NSpin :show="isLoading && icons.length === 0">
          <IconGrid
            v-if="icons.length > 0"
            :icons="icons"
            :scope="selectedSet === null ? 'all' : 'single'"
            :editable="canEditIcon"
            :deletable="canDeleteIcon"
            @copy="copy($event, '已复制图标名称')"
            @copy-svg="copy($event, '已复制 SVG')"
            @edit="openIconFormDrawer"
            @delete="confirmDeleteIcon"
          />
          <NEmpty v-else-if="!isLoading && error === null" :description="emptyDescription" />
          <div v-else class="h-40" />
        </NSpin>
        <div v-if="isLoading && icons.length > 0" class="flex justify-center py-4">
          <NSpin size="small" />
        </div>
      </NInfiniteScroll>
    </section>
  </section>

  <IconSetFormDrawer
    v-if="hasOpenedSetDrawer"
    v-model:show="isSetDrawerVisible"
    :prefix="editingPrefix"
    @saved="message.success('保存图标集成功')"
  />
  <IconUploadDrawer
    v-if="hasOpenedUploadDrawer"
    v-model:show="isUploadDrawerVisible"
    :prefix="selectedPrefix"
  />
  <IconFormDrawer
    v-if="hasOpenedIconDrawer"
    v-model:show="isIconDrawerVisible"
    :icon="editingIcon"
    @saved="message.success('编辑图标成功')"
  />
</template>
