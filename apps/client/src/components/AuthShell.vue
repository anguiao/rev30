<template>
  <main class="min-h-svh bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <section
      class="mx-auto grid min-h-[calc(100svh-3rem)] w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,1fr)_25rem]"
    >
      <div class="flex min-h-[34rem] flex-col justify-between p-6 sm:p-8 lg:p-10">
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white"
          >
            R30
          </div>
          <div>
            <p class="text-base font-semibold leading-6">Rev30</p>
            <p class="text-sm text-slate-500">Workspace access</p>
          </div>
        </div>

        <div class="mx-auto w-full max-w-md py-10">
          <slot />
        </div>

        <p class="text-xs text-slate-500">
          Session state is scoped to this browser and refreshed by the Rev30 API.
        </p>
      </div>

      <aside class="border-t border-slate-200 bg-slate-950 p-6 text-white sm:p-8 lg:border-l lg:border-t-0">
        <div class="flex h-full flex-col justify-between gap-10">
          <div>
            <p class="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">Auth console</p>
            <h2 class="mt-4 text-2xl font-semibold leading-tight">Secure team sessions for focused work.</h2>
            <p class="mt-4 text-sm leading-6 text-slate-300">
              Sign in to continue into the Rev30 workbench. Tokens are issued by the server and stored
              separately from refresh credentials.
            </p>
          </div>

          <dl class="grid gap-4 text-sm">
            <div class="border-t border-white/10 pt-4">
              <dt class="font-medium text-slate-200">Access control</dt>
              <dd class="mt-1 text-slate-400">Enabled accounts only can open protected routes.</dd>
            </div>
            <div class="border-t border-white/10 pt-4">
              <dt class="font-medium text-slate-200">Session recovery</dt>
              <dd class="mt-1 text-slate-400">Refresh checks run before guarded pages are entered.</dd>
            </div>
            <div class="border-t border-white/10 pt-4">
              <dt class="font-medium text-slate-200">Audit friendly</dt>
              <dd class="mt-1 text-slate-400">Authentication requests use typed shared schemas.</dd>
            </div>
          </dl>
        </div>
      </aside>
    </section>
  </main>
</template>
