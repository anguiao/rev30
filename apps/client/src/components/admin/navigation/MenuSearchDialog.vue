<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ResourceTreeNode } from '@rev30/contracts'
import { NModal } from 'naive-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  filterSearchableMenus,
  getMenuLinkTargetAttributes,
  getSearchableMenus,
} from '../../../utils/menu'

const props = defineProps<{
  show: boolean
  menus: ResourceTreeNode[]
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const router = useRouter()
const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const selectedIndex = ref(-1)
const isComposing = ref(false)
const searchableMenus = computed(() => getSearchableMenus(props.menus))
const results = computed(() => filterSearchableMenus(searchableMenus.value, query.value))
const selectedId = computed(() => results.value[selectedIndex.value]?.menu.id ?? null)

watch(results, (items) => {
  selectedIndex.value = items.length === 0 ? -1 : 0
})

watch(
  () => props.show,
  async (show) => {
    if (!show) return

    query.value = ''
    isComposing.value = false
    selectedIndex.value = searchableMenus.value.length === 0 ? -1 : 0
    await nextTick()
    focusInput()
  },
  { immediate: true },
)

function focusInput() {
  inputRef.value?.focus()
}

defineExpose({ focusInput })

function close() {
  emit('update:show', false)
}

function menuHref(menu: ResourceTreeNode) {
  return menu.path !== null ? router.resolve(menu.path).href : menu.externalUrl!
}

function handleLinkClick(event: MouseEvent, menu: ResourceTreeNode) {
  if (event.defaultPrevented) return

  if (
    menu.path !== null &&
    menu.openTarget === 'self' &&
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault()
    close()
    const path = menu.path
    void nextTick().then(() => router.push(path))
    return
  }

  close()
}

function selectedOption() {
  const id = selectedId.value
  return id === null ? null : document.getElementById(`menu-search-result-${id}`)
}

async function moveSelection(direction: number) {
  if (results.value.length === 0) return

  selectedIndex.value =
    (selectedIndex.value + direction + results.value.length) % results.value.length
  await nextTick()
  selectedOption()?.scrollIntoView({ block: 'nearest' })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || isComposing.value) return

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void moveSelection(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    selectedOption()?.querySelector('a')?.click()
  }
}
</script>

<template>
  <NModal
    :show="show"
    transform-origin="center"
    @update:show="emit('update:show', $event)"
    @after-enter="focusInput"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="搜索菜单"
      class="flex max-h-[calc(100dvh-4rem)] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      style="margin: 8vh auto auto"
    >
      <div
        class="flex shrink-0 items-center gap-3 border-b border-stone-200 px-4 dark:border-zinc-800"
      >
        <span
          class="i-[lucide--search] size-5 shrink-0 text-stone-500 dark:text-zinc-400"
          aria-hidden="true"
        />
        <input
          ref="inputRef"
          v-model="query"
          role="combobox"
          aria-label="搜索菜单"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="menu-search-results"
          :aria-activedescendant="
            selectedId === null ? undefined : `menu-search-result-${selectedId}`
          "
          type="text"
          placeholder="搜索菜单"
          class="min-w-0 flex-1 bg-transparent py-4 text-sm text-current outline-none placeholder:text-stone-400 dark:placeholder:text-zinc-500"
          @keydown="handleKeydown"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
        <button
          type="button"
          aria-label="关闭搜索"
          class="grid size-7 shrink-0 cursor-pointer place-items-center rounded text-stone-500 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-primary dark:text-zinc-400 dark:hover:bg-zinc-800"
          @click="close"
        >
          <span class="i-[lucide--x] size-4" aria-hidden="true" />
        </button>
      </div>

      <ul
        id="menu-search-results"
        role="listbox"
        aria-label="菜单搜索结果"
        class="max-h-[min(24rem,calc(100dvh-12rem))] min-h-0 overflow-y-auto p-2"
      >
        <li
          v-for="(item, index) in results"
          :id="`menu-search-result-${item.menu.id}`"
          :key="item.menu.id"
          role="option"
          :aria-selected="index === selectedIndex"
          @mouseenter="selectedIndex = index"
        >
          <a
            :href="menuHref(item.menu)"
            v-bind="getMenuLinkTargetAttributes(item.menu.openTarget)"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-current no-underline hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-zinc-800"
            :class="index === selectedIndex ? 'bg-primary-muted' : ''"
            @click="handleLinkClick($event, item.menu)"
          >
            <Icon
              v-if="item.menu.icon !== null"
              :icon="item.menu.icon"
              :height="18"
              class="shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ item.menu.name }}</span>
              <span
                v-if="item.parentNames.length > 0"
                class="mt-0.5 block truncate text-xs text-stone-500 dark:text-zinc-400"
              >
                {{ item.parentNames.join(' / ') }}
              </span>
            </span>
            <span
              v-if="item.menu.openTarget === 'blank'"
              class="shrink-0 text-xs text-stone-500 dark:text-zinc-400"
              >新窗口打开</span
            >
          </a>
        </li>
        <li
          v-if="results.length === 0"
          role="status"
          class="px-3 py-8 text-center text-sm text-stone-500 dark:text-zinc-400"
        >
          {{ searchableMenus.length === 0 ? '暂无可访问菜单' : '未找到匹配的菜单' }}
        </li>
      </ul>

      <div
        class="shrink-0 border-t border-stone-200 px-4 py-2 text-xs text-stone-500 dark:border-zinc-800 dark:text-zinc-400"
      >
        ↑↓ 选择 · Enter 打开 · Esc 关闭
      </div>
    </div>
  </NModal>
</template>
