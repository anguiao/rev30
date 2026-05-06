<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMutation } from '@pinia/colada'
import type { ResourceTreeNode } from '@rev30/shared'
import { storeToRefs } from 'pinia'
import { computed, h } from 'vue'
import { NButton, NEmpty, NMenu, type MenuOption } from 'naive-ui'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { logout } from '../../features/auth'
import { useAuthStore } from '../../stores/auth'
import ThemeModeSwitch from '../common/ThemeModeSwitch.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { menus, user } = storeToRefs(auth)

const logoutMutation = useMutation({
  mutation: () => logout(),
  async onSettled() {
    auth.clearSession()
    await router.push('/login')
  },
})

const isLoggingOut = computed(() => logoutMutation.isLoading.value)

function handleLogout() {
  logoutMutation.mutate()
}

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
        rel: resource.openTarget === 'blank' ? 'noreferrer' : undefined,
      },
      resource.name,
    )
}

function createMenuOption(resource: ResourceTreeNode): MenuOption {
  const children = resource.children.map(createMenuOption)
  const icon = renderMenuIcon(resource.icon)
  const option: MenuOption = {
    key: resource.path ?? resource.externalUrl ?? resource.id,
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

function matchesMenuPath(currentPath: string, menuPath: string) {
  return currentPath === menuPath || currentPath.startsWith(`${menuPath}/`)
}

const menuOptions = computed<MenuOption[]>(() => menus.value.map(createMenuOption))

function findSelectedMenuKey(resources: ResourceTreeNode[], currentPath: string): string | null {
  let matchedPath: string | null = null

  for (const resource of resources) {
    if (resource.path !== null && matchesMenuPath(currentPath, resource.path)) {
      if (matchedPath === null || resource.path.length > matchedPath.length) {
        matchedPath = resource.path
      }
    }

    const childMatchedPath = findSelectedMenuKey(resource.children, currentPath)

    if (
      childMatchedPath !== null &&
      (matchedPath === null || childMatchedPath.length > matchedPath.length)
    ) {
      matchedPath = childMatchedPath
    }
  }

  return matchedPath
}

const selectedMenuKey = computed<string | null>(() => findSelectedMenuKey(menus.value, route.path))
</script>

<template>
  <div
    class="min-h-screen min-w-[1120px] bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100"
  >
    <div class="mx-auto grid min-h-screen max-w-[1600px] grid-cols-[260px_1fr]">
      <aside
        class="flex flex-col border-r border-stone-200 bg-white px-5 py-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header class="mb-8 border-b border-stone-200 pb-5 dark:border-zinc-800">
          <p class="text-lg font-semibold">Rev30</p>
          <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">后台管理</p>
        </header>

        <nav class="flex-1">
          <NEmpty
            v-if="menuOptions.length === 0"
            description="暂无可访问菜单"
            size="small"
            class="pt-12"
          />
          <NMenu v-else :options="menuOptions" :value="selectedMenuKey" default-expand-all />
        </nav>

        <footer class="border-t border-stone-200 pt-4 dark:border-zinc-800">
          <div class="mb-4 flex items-center justify-between">
            <div class="space-y-0.5">
              <p class="text-sm font-medium">{{ user?.nickname ?? '' }}</p>
              <p class="text-xs text-stone-500 dark:text-zinc-400">{{ user?.username ?? '' }}</p>
            </div>
            <ThemeModeSwitch />
          </div>
          <NButton
            data-test="admin-logout"
            block
            strong
            tertiary
            type="default"
            :loading="isLoggingOut"
            @click="handleLogout"
          >
            退出登录
          </NButton>
        </footer>
      </aside>

      <main class="p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
