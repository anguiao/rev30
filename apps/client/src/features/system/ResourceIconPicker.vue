<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { watchDebounced } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import {
  NAlert,
  NEmpty,
  NInput,
  NInputGroup,
  NInputGroupLabel,
  NPopover,
  NSpin,
  NTooltip,
} from 'naive-ui'
import { computed, nextTick, ref } from 'vue'
import { searchIcons } from '.'

const props = defineProps<{
  value: string | null
}>()

const emit = defineEmits<{
  'update:value': [value: string | null]
  blur: []
}>()

const searchInputRef = ref<InstanceType<typeof NInput> | null>(null)

const showPanel = ref(false)

const limit = 60
const keyword = ref('')
const queryKeyword = ref('')

const {
  data: iconSearchData,
  error: iconSearchError,
  isLoading: isSearching,
} = useQuery({
  key: () => ['system', 'icons', 'search', queryKeyword.value, limit],
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
const searchError = computed(() =>
  iconSearchError.value === null || isSearching.value ? '' : '图标搜索失败',
)

watchDebounced(keyword, (nextKeyword) => (queryKeyword.value = nextKeyword), { debounce: 200 })

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
        ref="searchInputRef"
        data-test="resource-icon-search"
        clearable
        placeholder="搜索图标"
        :value="keyword"
        @update:value="(nextValue) => (keyword = nextValue)"
      />

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
        <NEmpty v-else-if="!isSearching" description="暂无图标" class="py-6" />
        <div v-else class="py-6" />
      </NSpin>
    </div>
  </NPopover>
</template>
