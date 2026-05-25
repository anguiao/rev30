<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ResourceTreeNode } from '@rev30/contracts'
import { treeToArray } from '@rev30/utils'
import { computed, h, ref, watch } from 'vue'
import { NEmpty, NMenu, type MenuOption } from 'naive-ui'
import { RouterLink, useRoute } from 'vue-router'
import { findMenuMatch, type MenuMatch } from '../../../utils/menu'

const props = defineProps<{
  collapsed: boolean
  menus: ResourceTreeNode[]
}>()

const route = useRoute()

const menuOptions = computed(() => props.menus.map(createMenuOption))
const availableMenuKeys = computed(() => new Set(treeToArray(props.menus).map((menu) => menu.id)))

const menuMatch = computed(() => findMenuMatch(props.menus, route.path))
const activeMenuKey = computed(() => menuMatch.value?.selectedMenu.key ?? null)

const expandedMenuKeys = ref<string[]>([])

function handleExpandedKeysUpdate(keys: string[]) {
  expandedMenuKeys.value = keys.filter((key) => availableMenuKeys.value.has(key))
}

function syncExpandedMenuKeys(match: MenuMatch | null, availableKeys: Set<string>) {
  const expandedKeys = expandedMenuKeys.value.filter((key) => availableKeys.has(key))
  const mergedExpandedKeys = new Set(expandedKeys)

  for (const key of match?.parentKeys ?? []) {
    mergedExpandedKeys.add(key)
  }

  expandedMenuKeys.value = [...mergedExpandedKeys]
}

watch(
  [menuMatch, availableMenuKeys],
  ([match, availableKeys]) => syncExpandedMenuKeys(match, availableKeys),
  { immediate: true },
)

function renderMenuIcon(icon: string) {
  return () =>
    h(Icon, {
      icon,
      height: 16,
    })
}

function renderInternalLabel(path: string, name: string) {
  return () =>
    h(
      RouterLink,
      {
        to: path,
      },
      {
        default: () => name,
      },
    )
}

function renderExternalLabel(
  url: string,
  openTarget: ResourceTreeNode['openTarget'],
  name: string,
) {
  return () =>
    h(
      'a',
      {
        href: url,
        target: openTarget === 'blank' ? '_blank' : undefined,
        rel: openTarget === 'blank' ? 'noopener noreferrer' : undefined,
      },
      name,
    )
}

function createMenuOption(menu: ResourceTreeNode): MenuOption {
  const option: MenuOption = {
    key: menu.id,
  }

  if (menu.icon !== null) {
    option.icon = renderMenuIcon(menu.icon)
  }

  if (menu.path !== null) {
    option.label = renderInternalLabel(menu.path, menu.name)
  } else if (menu.externalUrl !== null) {
    option.label = renderExternalLabel(menu.externalUrl, menu.openTarget, menu.name)
  } else {
    option.label = menu.name
  }

  const children = menu.children.map(createMenuOption)
  if (children.length > 0) {
    option.children = children
  }

  return option
}
</script>

<template>
  <nav class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    <NEmpty
      v-if="menuOptions.length === 0"
      v-show="!collapsed"
      description="暂无可访问菜单"
      size="small"
      class="pt-12"
    />
    <NMenu
      v-else
      :collapsed="collapsed"
      :collapsed-icon-size="18"
      :collapsed-width="60"
      :options="menuOptions"
      :root-indent="20"
      :value="activeMenuKey"
      :expanded-keys="expandedMenuKeys"
      @update:expanded-keys="handleExpandedKeysUpdate"
    />
  </nav>
</template>
