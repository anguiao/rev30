<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { Icon } from '@iconify/vue'
import { NEmpty, NInput, NInputGroup, NInputGroupLabel, NPopover, NSpin, NTooltip } from 'naive-ui'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { iconSearchKeywordKey } from '../cache'
import { searchIcons } from '../requests'
import { useIconSearchKeyword } from './useIconSearchKeyword'
import { useIconSearchRetry } from './useIconSearchRetry'
import IconSearchFeedback from './IconSearchFeedback.vue'

const value = defineModel<string | null>('value', { required: true })
const emit = defineEmits<{ blur: [] }>()

const searchInputRef = useTemplateRef<InstanceType<typeof NInput>>('searchInputRef')

const showPanel = ref(false)

const limit = 60
const { keyword, queryKeyword } = useIconSearchKeyword()

const { data, error, isLoading, refetch } = useQuery({
  key: () => ['system', 'icons', 'search', ...iconSearchKeywordKey(queryKeyword.value), limit],
  enabled: () => showPanel.value,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  query: () =>
    searchIcons({
      keyword: queryKeyword.value,
      limit,
    }),
})

const icons = computed(() => data.value?.list ?? [])
const hasSearchKeyword = computed(() => queryKeyword.value.length > 0)
const { retry } = useIconSearchRetry({
  error,
  isLoading,
  enabled: () => showPanel.value && hasSearchKeyword.value,
  refetch,
})
const emptyDescription = computed(() =>
  hasSearchKeyword.value ? '未找到匹配图标，请尝试其他关键词' : '暂无图标',
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
  value.value = icon
  closePanel()
}
</script>

<template>
  <NPopover
    trigger="manual"
    :show="showPanel"
    placement="bottom-start"
    :width="420"
    style="max-width: calc(100vw - 32px)"
    :show-arrow="false"
    @clickoutside="closePanel"
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
          @clear="value = null"
        />
      </NInputGroup>
    </template>

    <div class="flex max-w-full flex-col gap-3">
      <NInput
        v-model:value="keyword"
        ref="searchInputRef"
        data-test="resource-icon-search"
        clearable
        placeholder="搜索图标，支持中英文"
      />
      <IconSearchFeedback :error="error" :loading="isLoading" @retry="retry" />

      <NSpin :show="isLoading" content-class="min-h-12">
        <div
          v-if="icons.length > 0"
          class="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] justify-items-center gap-2"
        >
          <NTooltip v-for="item in icons" :key="item.icon" trigger="hover">
            <template #trigger>
              <button
                data-test="resource-icon-option"
                type="button"
                class="grid size-8 place-items-center rounded border border-transparent text-lg text-stone-500 transition-colors hover:border-primary hover:bg-stone-100 hover:text-primary focus-visible:border-primary focus-visible:bg-stone-100 focus-visible:text-primary focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                :class="{
                  'border-primary bg-stone-100 text-primary dark:bg-zinc-800': item.icon === value,
                }"
                :aria-label="item.icon"
                :aria-pressed="item.icon === value"
                @click="selectIcon(item.icon)"
              >
                <Icon :icon="item.icon" class="max-h-full max-w-full" />
              </button>
            </template>
            {{ item.icon }}
          </NTooltip>
        </div>
        <NEmpty
          v-else-if="!isLoading && error === null"
          :description="emptyDescription"
          class="py-6"
        />
      </NSpin>
    </div>
  </NPopover>
</template>
