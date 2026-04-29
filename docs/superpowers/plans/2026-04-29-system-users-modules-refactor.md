# System Users Modules Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the database-backed system user implementation out of heavy route files and into a focused module while preserving the existing API contract and behavior.

**Architecture:** `apps/server/src/modules` is the single home for server HTTP adapters and domain modules. The `system/users` module owns HTTP adapter routes, service use cases, Drizzle repository queries, row mapping, and module-specific errors. `apps/server/src/rpc.ts` and `packages/shared` remain unchanged runtime boundaries.

**Tech Stack:** pnpm workspace, TypeScript, Hono, Drizzle ORM, zod schemas from `@rev30/shared`, Vitest.

---

## File Structure

- Create `apps/server/src/modules/system/users/errors.ts`: module-specific error classes and unique conflict metadata.
- Create `apps/server/src/modules/system/users/mapper.ts`: convert database user rows to shared `SystemUser` responses.
- Create `apps/server/src/modules/system/users/repository.ts`: Drizzle queries for list, detail, create, update, soft delete, and unique conflict lookup.
- Create `apps/server/src/modules/system/users/service.ts`: user use cases and business decisions such as conflict handling and not-found behavior.
- Create `apps/server/src/modules/system/users/routes.ts`: Hono HTTP adapter that parses requests and maps service results/errors to HTTP responses.
- Create `apps/server/src/modules/system/users/service.test.ts`: module-level tests for service behavior.
- Create `apps/server/src/modules/system/routes.ts`: mount user routes from the system module.
- Create `apps/server/src/modules/system/users/routes.test.ts`: test the user route factory beside its module.
- Delete `apps/server/src/routes`: remove the old top-level route tree after modules take over.

## Tasks

- [ ] Add a failing service-level test that imports `createSystemUserService` from the new module and verifies duplicate username creation returns a `SystemUserConflictError`.
- [ ] Implement module errors, mapper, repository, service, and routes with the same behavior as the existing route file.
- [ ] Repoint system route assembly and tests to the new module path.
- [ ] Remove the old route implementation.
- [ ] Run server tests and typecheck to verify behavior and module boundaries.

## Follow-Up: Remove Top-Level Routes Directory

**Goal:** Make `apps/server/src/modules` the single home for server HTTP adapters.

**File Structure:**

- Create `apps/server/src/modules/health/routes.ts` from the old health route.
- Create `apps/server/src/modules/health/routes.test.ts` from the old health route test.
- Create `apps/server/src/modules/system/routes.ts` from the old system route assembly.
- Move `apps/server/src/routes/system/users.test.ts` to `apps/server/src/modules/system/users/routes.test.ts`.
- Modify `apps/server/src/app.ts` to import routes directly from modules.
- Delete the now-empty `apps/server/src/routes` tree.

**Tasks:**

- [ ] Move route tests beside their module route adapters and update relative imports.
- [ ] Move `health` and `system` route assembly into modules.
- [ ] Update app composition imports.
- [ ] Remove the top-level `routes` directory.
- [ ] Run `pnpm check`.
