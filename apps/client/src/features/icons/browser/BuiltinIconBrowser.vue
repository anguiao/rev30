<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NEmpty, NInfiniteScroll, NInput, NSpin, useMessage } from 'naive-ui'
import type { BuiltinIconSetItem, BuiltinIconSetListResponse } from '@rev30/contracts'
import { getErrorMessage } from '../../../utils/error'
import { listBuiltinIcons, listBuiltinIconSets } from '../requests'
import { useIconList } from './useIconList'
import IconGrid from './IconGrid.vue'

const props = defineProps<{
  active: boolean
}>()

const message = useMessage()
const filterDebounceMs = 250
const iconScrollLoadOffset = 160
const emptyIconSetListData: BuiltinIconSetListResponse = {
  list: [],
  total: 0,
}

const setKeyword = ref('')
const setQueryKeyword = refDebounced(
  computed(() => {
    const keyword = setKeyword.value.trim()

    return keyword.length > 0 ? keyword : undefined
  }),
  filterDebounceMs,
)
const selectedSet = ref<BuiltinIconSetItem | null>(null)
const selectedPrefix = computed(() => selectedSet.value?.prefix ?? null)
const {
  data: setsResponse,
  error: setsError,
  isLoading: isLoadingSets,
} = useQuery({
  key: () => ['content', 'icon-sets', 'builtin', 'sets', setQueryKeyword.value ?? ''],
  enabled: () => props.active,
  placeholderData: () => emptyIconSetListData,
  query: () => listBuiltinIconSets({ keyword: setQueryKeyword.value }),
})

const {
  keyword: iconKeyword,
  icons,
  error: iconsError,
  isLoading: isLoadingIcons,
  hasSearchKeyword: hasIconQuery,
  scrollKey: iconScrollKey,
  searchState: iconSearchState,
  loadMore: loadMoreIcons,
} = useIconList({
  source: 'builtin',
  active: computed(() => props.active),
  prefix: selectedPrefix,
  query: listBuiltinIcons,
})

const setsData = computed(() => setsResponse.value ?? emptyIconSetListData)
const setErrorMessage = computed(() =>
  setsError.value === null ? '' : getErrorMessage(setsError.value, '加载内置图标集失败'),
)
const iconErrorMessage = computed(() =>
  iconSearchState.isOrdinaryError.value
    ? getErrorMessage(iconsError.value, '加载内置图标失败')
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

function selectSet(iconSet: BuiltinIconSetItem | null) {
  selectedSet.value = iconSet
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
        <div>
          <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">内置图标集</div>
          <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
            共 {{ setsData.total }} 个
          </div>
        </div>

        <NInput
          v-model:value="setKeyword"
          data-test="builtin-icon-set-filter"
          clearable
          placeholder="筛选图标集"
        />

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <NSpin :show="isLoadingSets">
            <div class="space-y-0.5">
              <button
                type="button"
                data-test="builtin-icon-set-all"
                class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
                :class="
                  selectedSet === null
                    ? 'bg-primary/5 text-primary'
                    : 'text-stone-700 hover:bg-stone-50 dark:text-zinc-200 dark:hover:bg-zinc-800'
                "
                @click="selectSet(null)"
              >
                <div class="truncate text-sm font-medium">全部内置</div>
                <div class="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
                  {{ setsData.total }} 个图标集
                </div>
              </button>

              <button
                v-for="iconSet in setsData.list"
                :key="iconSet.prefix"
                data-test="builtin-icon-set"
                type="button"
                class="w-full rounded-ui px-2.5 py-1.5 text-left transition-colors"
                :class="
                  selectedPrefix === iconSet.prefix
                    ? 'bg-primary/5'
                    : 'hover:bg-stone-50 dark:hover:bg-zinc-800'
                "
                @click="selectSet(iconSet)"
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
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-stone-900 dark:text-zinc-100">
              {{ selectedSet?.name ?? '全部内置图标集' }}
            </div>
            <div class="mt-1 truncate text-xs text-stone-500 dark:text-zinc-400">
              {{ selectedPrefix ?? `${setsData.total} 个图标集` }}
            </div>
          </div>

          <NInput
            v-model:value="iconKeyword"
            data-test="builtin-icon-filter"
            clearable
            placeholder="搜索中英文名称和关键词"
            class="w-full sm:w-72!"
          />
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
          <NButton
            size="small"
            text
            class="ml-2"
            :loading="isLoadingIcons"
            @click="iconSearchState.retry"
          >
            重试
          </NButton>
        </NAlert>

        <NInfiniteScroll
          :key="iconScrollKey"
          data-test="builtin-icon-scroll"
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
              @copy="copyIcon"
              @copy-svg="copySvg"
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
  </div>
</template>
