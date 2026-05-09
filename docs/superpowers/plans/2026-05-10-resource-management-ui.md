# Resource Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project run is explicitly inline on branch `codex-resource-management-ui` without a worktree.

**Goal:** Complete the resource management frontend so users can create, edit, create child resources, delete leaf resources, and preview Iconify icons from a plain text input.

**Architecture:** Follow the existing department management pattern. Request helpers wrap the Hono typed client and zod response parsing; `ResourceFormDrawer.vue` owns form loading, validation, mutation, and icon preview; `resources.vue` owns table actions, delete confirmation, and tree refresh. Resource parent options reuse the existing `toTreeOptions` helper rather than adding a resource-specific converter.

**Tech Stack:** Vue 3 Composition API, Naive UI, Pinia Colada, TanStack Vue Form, Hono typed client, zod schemas from `@rev30/shared`, Vitest, happy-dom.

---

## Scope Check

This plan implements one frontend subsystem: resource CRUD management UI. It does not implement an icon picker, drag-and-drop sorting, role authorization changes, route generation, or audit features.

## File Structure

- Modify `apps/client/src/features/system/requests.ts`: add resource detail/create/update/delete helpers.
- Modify `apps/client/src/features/system/index.ts`: export the new resource helpers.
- Modify `apps/client/__tests__/features/system/requests.test.ts`: cover resource helpers.
- Create `apps/client/src/features/system/ResourceFormDrawer.vue`: resource create/edit drawer with Iconify text preview.
- Create `apps/client/__tests__/features/system/ResourceFormDrawer.test.ts`: cover form modes, type-specific payloads, tree options, icon preview, and server errors.
- Modify `apps/client/src/pages/index/system/resources.vue`: wire drawer and delete behavior.
- Modify `apps/client/__tests__/pages/system/resources.test.ts`: cover drawer actions, save refresh, delete guards, and delete success/failure.
- Modify `README.md`: update project progress from resource read-only page to resource management page.

## Task 1: Resource Request Helpers

**Files:**

- Modify: `apps/client/__tests__/features/system/requests.test.ts`
- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/src/features/system/index.ts`

- [ ] **Step 1: Write failing resource helper tests**

Add resource helper imports to `apps/client/__tests__/features/system/requests.test.ts`:

```ts
  createResource,
  deleteResource,
  getResource,
  updateResource,
```

Add missing constants:

```ts
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_TYPE_DIRECTORY,
```

Add a test after the existing resource tree test:

```ts
  it('sends resource detail, create, update, and delete requests', async () => {
    const resourceResponse = {
      id: '44444444-4444-4444-8444-444444444444',
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: '系统管理',
      code: 'system',
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'lucide:settings',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }
    const updatedResourceResponse = {
      ...resourceResponse,
      name: '资源管理',
      code: 'system:resource',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(resourceResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(resourceResponse), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedResourceResponse)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const resource = await getResource('44444444-4444-4444-8444-444444444444')
    const created = await createResource({
      type: RESOURCE_TYPE_DIRECTORY,
      name: '系统管理',
      code: 'system',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'lucide:settings',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 1,
    })
    const updated = await updateResource('44444444-4444-4444-8444-444444444444', {
      name: '资源管理',
      code: 'system:resource',
    })
    await deleteResource('44444444-4444-4444-8444-444444444444')

    expect(resource.icon).toBe('lucide:settings')
    expect(created.name).toBe('系统管理')
    expect(updated.code).toBe('system:resource')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/system/resources/44444444-4444-4444-8444-444444444444',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources/44444444-4444-4444-8444-444444444444',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/resources/44444444-4444-4444-8444-444444444444',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: FAIL because `getResource`, `createResource`, `updateResource`, and `deleteResource` are not exported.

- [ ] **Step 3: Implement resource helper functions**

In `apps/client/src/features/system/requests.ts`, add resource imports:

```ts
  resourceSchema,
  type Resource,
  type ResourceCreateInput,
  type ResourceUpdateInput,
```

Add helpers next to `getResourceTree()`:

```ts
export async function getResource(id: string): Promise<Resource> {
  return parseSystemResponse(await api.system.resources[':id'].$get({ param: { id } }), resourceSchema)
}

export async function createResource(input: ResourceCreateInput): Promise<Resource> {
  return parseSystemResponse(await api.system.resources.$post({ json: input }), resourceSchema)
}

export async function updateResource(id: string, input: ResourceUpdateInput): Promise<Resource> {
  return parseSystemResponse(
    await api.system.resources[':id'].$patch({ param: { id }, json: input }),
    resourceSchema,
  )
}

export async function deleteResource(id: string): Promise<void> {
  const response = await api.system.resources[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}
```

Export the helpers from `apps/client/src/features/system/index.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/__tests__/features/system/requests.test.ts apps/client/src/features/system/requests.ts apps/client/src/features/system/index.ts
git commit -m "feat: add resource request helpers"
```

## Task 2: Resource Form Drawer

**Files:**

- Create: `apps/client/src/features/system/ResourceFormDrawer.vue`
- Create: `apps/client/__tests__/features/system/ResourceFormDrawer.test.ts`

- [ ] **Step 1: Write failing drawer tests**

Create `apps/client/__tests__/features/system/ResourceFormDrawer.test.ts` following `DepartmentFormDrawer.test.ts`. Mock `@iconify/vue` with a component that renders the `icon` prop:

```ts
vi.mock('@iconify/vue', () => ({
  Icon: defineComponent({
    name: 'Icon',
    props: { icon: { type: String, required: true } },
    setup(props: { icon: string }) {
      return () => h('span', { 'data-test': 'resource-icon-preview' }, props.icon)
    },
  }),
}))
```

Mock `createResource`, `getResource`, `getResourceTree`, and `updateResource`. Cover these behaviors:

- creates a root directory resource with defaults and `icon: null`;
- creates a child menu resource with the provided parent id;
- loads edit detail and disables the edited resource subtree in `NTreeSelect`;
- shows the inline icon preview for `lucide:settings`;
- submits menu payloads with `path` and external payloads with `externalUrl`;
- shows field-level server errors.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- ResourceFormDrawer
```

Expected: FAIL because `ResourceFormDrawer.vue` does not exist.

- [ ] **Step 3: Implement `ResourceFormDrawer.vue`**

Implement a drawer mirroring `DepartmentFormDrawer.vue` with these specifics:

- `defaultFormValues` uses `RESOURCE_TYPE_DIRECTORY`, `RESOURCE_OPEN_TARGET_SELF`, `RESOURCE_STATUS_ENABLED`, `hidden: false`, and `icon: null`.
- `resourceTreeOptions` calls `toTreeOptions(formData.value?.resources ?? [], { label: resource => \`${resource.name} (${resource.code})\`, ...(resourceId === null ? {} : { disabledSubtreeId: resourceId }) })`.
- Type options come from `resourceTypeLabels`.
- Open target options are `{ label: '当前窗口', value: RESOURCE_OPEN_TARGET_SELF }` and `{ label: '新窗口', value: RESOURCE_OPEN_TARGET_BLANK }`.
- The icon field uses `NInputGroup`, `NInput`, and a fixed-size preview span. If `state.value` is truthy, render `<Icon :icon="state.value" />`; otherwise render `无`.
- `onSubmit` parses with `resourceCreateSchema` or `resourceUpdateSchema`.
- Save success emits `saved` and closes the drawer; stale responses are ignored by checking `show`, `props.resourceId`, and `props.parentId`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- ResourceFormDrawer
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/ResourceFormDrawer.vue apps/client/__tests__/features/system/ResourceFormDrawer.test.ts
git commit -m "feat: add resource form drawer"
```

## Task 3: Resource Page Actions

**Files:**

- Modify: `apps/client/src/pages/index/system/resources.vue`
- Modify: `apps/client/__tests__/pages/system/resources.test.ts`

- [ ] **Step 1: Write failing page action tests**

In `resources.test.ts`, stub `ResourceFormDrawer.vue` like the department page stub. Mock `deleteResource`. Add tests that:

- open create, child create, and edit drawers;
- emit `saved` from the drawer and expect `getResourceTree` to refetch plus “保存资源成功” message;
- disable delete for resources with children, including filtered rows whose children are hidden;
- delete a leaf resource after confirmation and refetch;
- keep the delete dialog open and show the backend message when delete fails.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- resources
```

Expected: FAIL because page actions are not wired and `deleteResource` is not used.

- [ ] **Step 3: Wire resource page actions**

In `resources.vue`:

- import `useDialog`, `useMessage`, `deleteResource`, `isLeafInTree`, and `ResourceFormDrawer`;
- expose `refetch: refetchResources` from the resource tree query;
- add refs for drawer visibility, editing resource id, and selected parent resource id;
- add `openResourceFormDrawer`, `handleResourceSaved`, and `confirmDeleteResource`;
- pass `onClick` handlers to create, create-child, edit, and delete buttons;
- set edit button `accessCode` to `['system:resource:update', 'system:resource:list']`;
- set delete button `disabled: !isLeafInTree(rawTree.value, resource.id)`;
- render `ResourceFormDrawer` at the end of the page template.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- resources
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/index/system/resources.vue apps/client/__tests__/pages/system/resources.test.ts
git commit -m "feat: wire resource management actions"
```

## Task 4: Documentation and Full Verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README wording**

Change the directory/progress description so resources are no longer described as read-only management pages.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm --filter @rev30/client test -- requests
pnpm --filter @rev30/client test -- ResourceFormDrawer
pnpm --filter @rev30/client test -- resources
```

Expected: all targeted tests pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm check
```

Expected: format, lint, deprecated API check, typecheck, tests, and build all pass.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "docs: update resource management progress"
```

