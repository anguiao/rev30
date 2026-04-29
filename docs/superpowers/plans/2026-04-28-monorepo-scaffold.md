# Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal runnable pnpm monorepo with Hono + Drizzle server, Vue + Naive UI client, shared zod schemas, and oxc lint/format tooling.

**Architecture:** The workspace has three packages: `packages/shared`, `apps/server`, and `apps/client`. Runtime dependencies flow from server/client to shared; the client imports only the server RPC type and talks to `/api` through Hono RPC.

**Tech Stack:** pnpm workspaces, TypeScript, Vue 3, Vite, Naive UI, Hono, Hono RPC, Drizzle ORM, PGlite, PostgreSQL via postgres-js, zod, Vitest, oxlint, oxfmt.

---

### Task 1: Root Workspace And Tooling

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create root workspace files**

Create root scripts for dev, build, lint, format, tests, and typecheck. Use pnpm filters so each package owns its own commands.

- [ ] **Step 2: Update `.gitignore`**

Keep `legacy/` and add generated Node, build, local env, and PGlite storage paths.

- [ ] **Step 3: Install root dev dependencies**

Run: `pnpm install`

Expected: lockfile is created and workspace dependencies resolve.

### Task 2: Shared Package

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/profile.ts`
- Create: `packages/shared/src/profile.test.ts`

- [ ] **Step 1: Write shared schema test first**

`packages/shared/src/profile.test.ts` should verify that the profile schema accepts a valid profile and rejects an invalid email.

- [ ] **Step 2: Run the test to verify red**

Run: `pnpm --filter @rev30/shared test`

Expected: fail before `profile.ts` exists or before schema is implemented.

- [ ] **Step 3: Implement schema and exports**

Create `profileSchema` and `Profile` in `profile.ts`, then export them from `index.ts`.

- [ ] **Step 4: Run shared test to verify green**

Run: `pnpm --filter @rev30/shared test`

Expected: pass.

### Task 3: Server Package

**Files:**

- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/drizzle.config.ts`
- Create: `apps/server/.env.example`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/db/index.ts`
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/routes.test.ts`

- [ ] **Step 1: Write server route tests first**

`apps/server/src/routes.test.ts` should call `app.request('/api/health')` and `app.request('/api/profile')`, verifying response shapes and shared schema compatibility.

- [ ] **Step 2: Run the test to verify red**

Run: `pnpm --filter @rev30/server test`

Expected: fail before server app implementation exists.

- [ ] **Step 3: Implement Hono app and DB layer**

Create a Hono app with `/api/health` and `/api/profile`, export `AppType`, define the Drizzle profile table, and create a db factory that uses PGlite in development and postgres-js in production.

- [ ] **Step 4: Run server test to verify green**

Run: `pnpm --filter @rev30/server test`

Expected: pass.

### Task 4: Client Package

**Files:**

- Create: `apps/client/package.json`
- Create: `apps/client/tsconfig.json`
- Create: `apps/client/tsconfig.node.json`
- Create: `apps/client/vite.config.ts`
- Create: `apps/client/index.html`
- Create: `apps/client/src/main.ts`
- Create: `apps/client/src/App.vue`
- Create: `apps/client/src/api.ts`
- Create: `apps/client/src/style.css`

- [ ] **Step 1: Implement typed Hono RPC client**

Create `api.ts` using `hc<AppType>('/api')` and import `AppType` as a type from `@rev30/server`.

- [ ] **Step 2: Implement Vue shell**

Create a Naive UI application that fetches health and profile data on mount, displays both, and refreshes on button click.

- [ ] **Step 3: Run client typecheck**

Run: `pnpm --filter @rev30/client typecheck`

Expected: pass.

### Task 5: Workspace Verification

**Files:**

- Create or update: `README.md`
- Update: `package.json` if verification reveals script issues

- [ ] **Step 1: Add README**

Document install, dev, lint, format, typecheck, build, server env, and package layout.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Review git diff**

Run: `git status --short` and inspect changed files before reporting completion.
