<script setup lang="ts">
import ThemeModeSwitch from '../../components/common/ThemeModeSwitch.vue'
</script>

<template>
  <main
    class="flex min-h-svh flex-col bg-stone-50 text-stone-950 selection:bg-primary-selection lg:flex-row dark:bg-zinc-950 dark:text-zinc-50"
  >
    <div
      class="relative z-10 flex flex-1 flex-col justify-center border-r border-stone-200 bg-white px-6 py-12 shadow-2xl shadow-stone-200/20 transition-colors duration-300 sm:px-12 lg:w-120 lg:flex-none xl:w-140 dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none"
    >
      <div class="mx-auto flex h-full w-full max-w-sm flex-col gap-8 lg:max-w-md">
        <header class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div
              class="flex size-8 items-center justify-center rounded bg-stone-900 text-xs font-bold text-stone-50 dark:bg-primary dark:text-zinc-950"
            >
              R30
            </div>
            <span class="font-medium tracking-wide">Workspace</span>
          </div>
          <ThemeModeSwitch />
        </header>

        <div class="flex flex-1 flex-col justify-center">
          <slot />
        </div>

        <footer
          class="mt-auto text-center text-xs tracking-wide text-stone-400 uppercase dark:text-zinc-500"
        >
          Rev30
        </footer>
      </div>
    </div>

    <div
      class="relative hidden flex-1 flex-col justify-center overflow-hidden bg-stone-50 px-12 transition-colors duration-300 lg:flex xl:px-24 dark:bg-zinc-950"
    >
      <div
        class="absolute inset-0 bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] bg-size-[4rem_4rem] opacity-50 [--grid-line:#e5e7eb] dark:[--grid-line:#27272a]"
      ></div>

      <div class="relative z-10 max-w-xl">
        <div
          class="mb-8 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/50 px-3 py-1 text-xs font-medium text-stone-600 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-primary"
        >
          <span class="relative flex size-2">
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-hover opacity-75"
            ></span>
            <span class="relative inline-flex size-2 rounded-full bg-primary"></span>
          </span>
          认证系统
        </div>

        <h2 class="mb-6 text-4xl font-light tracking-tight text-stone-900 dark:text-zinc-100">
          Rev30 入口
        </h2>
        <p
          class="mb-12 max-w-md text-lg leading-relaxed font-light text-stone-500 dark:text-zinc-400"
        >
          通过统一的认证流程进入内部系统，访问令牌由服务端签发，受保护页面会在进入前恢复会话。
        </p>

        <div
          class="grid grid-cols-2 gap-8 border-t border-stone-200 pt-8 text-sm dark:border-zinc-800"
        >
          <div>
            <h3 class="mb-2 flex items-center gap-2 font-medium text-stone-900 dark:text-zinc-100">
              <span class="i-[lucide--shield-check] size-4 text-stone-400 dark:text-primary"></span>
              受保护路由
            </h3>
            <p class="leading-relaxed text-stone-500 dark:text-zinc-500">
              未认证用户会被引导回登录页，已登录用户不会重复进入认证页面。
            </p>
          </div>
          <div>
            <h3 class="mb-2 flex items-center gap-2 font-medium text-stone-900 dark:text-zinc-100">
              <span class="i-[lucide--key] size-4 text-stone-400 dark:text-primary"></span>
              类型化请求
            </h3>
            <p class="leading-relaxed text-stone-500 dark:text-zinc-500">
              登录、注册和刷新响应复用共享 schema，前后端约束保持一致。
            </p>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
