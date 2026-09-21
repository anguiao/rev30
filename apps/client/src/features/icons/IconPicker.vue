<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { Icon } from '@iconify/vue'
import {
  NAlert,
  NButton,
  NEmpty,
  NInput,
  NInputGroup,
  NInputGroupLabel,
  NPopover,
  NSpin,
  NTooltip,
} from 'naive-ui'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { iconSearchKey } from './query-keys'
import { searchIcons } from './requests'
import { useIconSearchKeyword } from './search-keyword'
import { useIconSearchState } from './search-state'

const props = defineProps<{
  value: string | null
}>()

const emit = defineEmits<{
  'update:value': [value: string | null]
  blur: []
}>()

const searchInputRef = useTemplateRef<InstanceType<typeof NInput>>('searchInputRef')

const showPanel = ref(false)

const limit = 60
const { keyword, queryKeyword } = useIconSearchKeyword(200)

const {
  data: iconSearchData,
  error: iconSearchError,
  asyncStatus,
  isLoading: isSearching,
  refetch,
} = useQuery({
  key: () => iconSearchKey(queryKeyword.value, limit),
  enabled: () => showPanel.value,
  placeholderData: () => ({ list: [] }),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  query: () =>
    searchIcons({
      keyword: queryKeyword.value,
      limit,
    }),
})

const results = computed(() => iconSearchData.value?.list ?? [])
const hasSearchKeyword = computed(() => queryKeyword.value.trim().length > 0)
const { isPreparing, isUnavailable, isOrdinaryError, retry } = useIconSearchState({
  error: iconSearchError,
  asyncStatus,
  enabled: computed(() => showPanel.value && hasSearchKeyword.value),
  refetch,
})
const searchError = computed(() => (isOrdinaryError.value ? '图标搜索失败' : ''))
const emptyDescription = computed(() =>
  hasSearchKeyword.value ? '未找到匹配图标，可尝试英文名称、图标 ID 或其他关键词' : '暂无图标',
)

async function openPanel() {
  if (showPanel.value) {
    return
  }
  keyword.value = ''
  queryKeyword.value = ''
  showPanel.value = true
  await nextTick()
  searchInputRef.value?.focus()
}

function closePanel() {
  if (!showPanel.value) {
    return
  }
  showPanel.value = false
  emit('blur')
}

function selectIcon(icon: string) {
  emit('update:value', icon)
  closePanel()
}
</script>

<template>
  <NPopover
    trigger="manual"
    :show="showPanel"
    placement="bottom-start"
    :width="420"
    :show-arrow="false"
    @clickoutside="closePanel"
    @update:show="(nextShow) => (nextShow ? void openPanel() : closePanel())"
  >
    <template #trigger>
      <NInputGroup>
        <NInputGroupLabel
          data-test="resource-icon-empty"
          class="inline-flex! min-w-10 items-center justify-center px-2.5"
        >
          <Icon v-if="value" :icon="value" class="size-4" />
          <span v-else>无</span>
        </NInputGroupLabel>
        <NInput
          data-test="resource-form-icon"
          clearable
          :allow-input="() => false"
          :value="value ?? ''"
          placeholder="未选择图标"
          @click="openPanel"
          @focus="openPanel"
          @update:value="
            (nextValue) => {
              if (nextValue === '') {
                emit('update:value', null)
              }
            }
          "
        />
      </NInputGroup>
    </template>

    <div class="max-w-full">
      <NInput
        v-model:value="keyword"
        ref="searchInputRef"
        data-test="resource-icon-search"
        clearable
        placeholder="搜索图标"
      />
      <div class="mt-1 text-xs text-stone-500 dark:text-zinc-400">
        支持中英文名称和关键词。部分内置图标支持中文，可尝试英文名称或图标 ID。
      </div>

      <NAlert v-if="isPreparing" type="info" :show-icon="false" class="mt-3">
        图标搜索正在准备
      </NAlert>

      <NAlert v-else-if="isUnavailable" type="warning" :show-icon="false" class="mt-3">
        图标搜索暂不可用
        <NButton size="small" text class="ml-2" :loading="isSearching" @click="retry">
          重试
        </NButton>
      </NAlert>

      <NAlert v-if="searchError" type="error" :show-icon="false" class="mt-3">
        {{ searchError }}
      </NAlert>

      <NSpin :show="isSearching" class="mt-3">
        <div
          v-if="results.length > 0"
          class="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] justify-items-center gap-2"
        >
          <NTooltip v-for="item in results" :key="item.icon" trigger="hover">
            <template #trigger>
              <button
                data-test="resource-icon-option"
                type="button"
                class="grid size-8 place-items-center rounded border border-transparent text-lg text-stone-500 transition-colors hover:border-primary hover:bg-stone-100 hover:text-primary focus-visible:border-primary focus-visible:bg-stone-100 focus-visible:text-primary focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                :class="
                  item.icon === value
                    ? 'border-primary bg-stone-100 text-primary dark:bg-zinc-800'
                    : ''
                "
                :aria-label="item.icon"
                @click="selectIcon(item.icon)"
              >
                <Icon :icon="item.icon" class="max-h-full max-w-full" />
              </button>
            </template>
            {{ item.icon }}
          </NTooltip>
        </div>
        <NEmpty
          v-else-if="!isSearching && !isPreparing && !isUnavailable && !searchError"
          :description="emptyDescription"
          class="py-6"
        />
        <div v-else class="py-6" />
      </NSpin>
    </div>
  </NPopover>
</template>
