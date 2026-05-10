<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import type { IconSearchItem } from '@rev30/shared'
import { NAlert, NEmpty, NInput, NInputGroup, NPopover, NSpin, NTooltip } from 'naive-ui'
import { nextTick, ref, watch } from 'vue'
import { searchIcons } from '.'

const props = defineProps<{
  value: string | null
}>()

const emit = defineEmits<{
  'update:value': [value: string | null]
  blur: []
}>()

const limit = 60
let searchRequestId = 0
let isResettingKeyword = false
const showPanel = ref(false)
const keyword = ref('')
const isSearching = ref(false)
const searchError = ref('')
const results = ref<IconSearchItem[]>([])
const searchInputRef = ref<InstanceType<typeof NInput> | null>(null)

function blockDisplayInput() {
  return false
}

async function runSearch() {
  if (!showPanel.value) {
    return
  }

  const requestId = ++searchRequestId
  isSearching.value = true
  searchError.value = ''

  try {
    const response = await searchIcons({
      keyword: keyword.value,
      limit,
    })
    if (requestId === searchRequestId && showPanel.value) {
      results.value = response.list
    }
  } catch {
    if (requestId === searchRequestId && showPanel.value) {
      searchError.value = '图标搜索失败'
      results.value = []
    }
  } finally {
    if (requestId === searchRequestId && showPanel.value) {
      isSearching.value = false
    }
  }
}

const runSearchDebounced = useDebounceFn(runSearch, 200)

watch(keyword, () => {
  if (!showPanel.value || isResettingKeyword) {
    return
  }
  void runSearchDebounced()
})

async function openPanel() {
  if (showPanel.value) {
    return
  }
  isResettingKeyword = true
  keyword.value = ''
  showPanel.value = true
  await nextTick()
  isResettingKeyword = false
  searchInputRef.value?.focus()
  await runSearch()
}

function closePanel() {
  if (!showPanel.value) {
    return
  }
  searchRequestId += 1
  showPanel.value = false
  isSearching.value = false
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
    @clickoutside="closePanel"
    @update:show="(nextShow) => (nextShow ? void openPanel() : closePanel())"
  >
    <template #trigger>
      <NInputGroup>
        <span class="icon-preview" data-test="resource-icon-empty">
          <Icon v-if="value" :icon="value" />
          <span v-else>无</span>
        </span>
        <NInput
          data-test="resource-form-icon"
          clearable
          :allow-input="blockDisplayInput"
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

    <div class="panel">
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
        <div v-if="results.length > 0" class="results-grid">
          <NTooltip v-for="item in results" :key="item.icon" trigger="hover">
            <template #trigger>
              <button
                data-test="resource-icon-option"
                type="button"
                class="icon-option border-transparent"
                :class="{ 'icon-option--selected': item.icon === value }"
                :aria-label="item.icon"
                @click="selectIcon(item.icon)"
              >
                <Icon :icon="item.icon" />
              </button>
            </template>
            {{ item.icon }}
          </NTooltip>
        </div>
        <NEmpty v-else-if="!isSearching" description="暂无图标" class="py-6" />
      </NSpin>
    </div>
  </NPopover>
</template>

<style scoped>
.icon-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 0 10px;
  border: 1px solid var(--n-border-color);
  border-right: 0;
  border-radius: var(--n-border-radius) 0 0 var(--n-border-radius);
  color: var(--n-text-color);
}

.panel {
  width: 420px;
  max-width: calc(100vw - 48px);
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 8px;
}

.icon-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-width: 1px;
  border-style: solid;
  border-radius: 8px;
  background-color: transparent;
  color: var(--n-text-color-2);
  cursor: pointer;
}

.icon-option:hover,
.icon-option:focus-visible {
  border-color: var(--n-primary-color-hover);
  color: var(--n-text-color);
}

.icon-option--selected {
  border-color: var(--n-primary-color);
  color: var(--n-primary-color);
}
</style>
