<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ResourceTreeNode } from '@rev30/shared'
import { computed, h, ref, watch } from 'vue'
import { NEmpty, NMenu, type MenuOption } from 'naive-ui'
import { RouterLink, useRoute } from 'vue-router'
import { collectMenuKeys, findActiveNavigation } from './adminNavigation'

const props = defineProps<{
  collapsed: boolean
  resources: ResourceTreeNode[]
}>()

const route = useRoute()
const menuOptions = computed(() => props.resources.map(createMenuOption))
const expandedMenuKeys = ref<string[]>([])
const availableMenuKeys = computed(() => collectMenuKeys(props.resources))
const activeNavigation = computed(() => findActiveNavigation(props.resources, route.path))
const activeMenuKey = computed(() => activeNavigation.value?.selectedKey ?? null)

function handleExpandedKeysUpdate(keys: string[]) {
  expandedMenuKeys.value = keys.filter((key) => availableMenuKeys.value.has(key))
}

watch(
  [activeNavigation, availableMenuKeys],
  ([match, availableKeys]) => {
    const mergedExpandedKeys = new Set(
      expandedMenuKeys.value.filter((key) => availableKeys.has(key)),
    )

    for (const key of match?.parentKeys ?? []) {
      mergedExpandedKeys.add(key)
    }

    expandedMenuKeys.value = [...mergedExpandedKeys]
  },
  { immediate: true },
)

function renderMenuIcon(icon: string | null) {
  if (icon === null) {
    return undefined
  }

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

function renderExternalLabel(resource: ResourceTreeNode) {
  return () =>
    h(
      'a',
      {
        href: resource.externalUrl ?? undefined,
        target: resource.openTarget === 'blank' ? '_blank' : undefined,
        rel: resource.openTarget === 'blank' ? 'noopener noreferrer' : undefined,
      },
      resource.name,
    )
}

function createMenuOption(resource: ResourceTreeNode): MenuOption {
  const children = resource.children.map(createMenuOption)
  const icon = renderMenuIcon(resource.icon)
  const option: MenuOption = {
    key: resource.id,
  }

  if (children.length > 0) {
    option.children = children
  }

  if (icon !== undefined) {
    option.icon = icon
  }

  if (resource.path !== null) {
    option.label = renderInternalLabel(resource.path, resource.name)
    return option
  }

  if (resource.externalUrl !== null) {
    option.label = renderExternalLabel(resource)
    return option
  }

  option.label = resource.name
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
