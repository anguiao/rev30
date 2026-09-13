import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NRadioGroup, NUpload, type UploadFileInfo } from 'naive-ui'
import type { CustomIconItem, CustomIconUploadResponse } from '@rev30/contracts'
import { uploadCustomIcons } from '../../../src/features/icons/requests'
import IconUploadDrawer from '../../../src/features/icons/IconUploadDrawer.vue'
import IconKeywordsInput from '../../../src/features/icons/IconKeywordsInput.vue'
import { createTestQueryHarness } from '../../helpers/colada'
import { createDeferred } from '../../helpers/promise'
import { refreshCustomIconCaches } from '../../../src/features/icons/cache'

vi.mock('../../../src/features/icons/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/icons/requests')>()),
  uploadCustomIcons: vi.fn(),
}))

vi.mock('../../../src/features/icons/cache', () => ({
  refreshCustomIconCaches: vi.fn().mockResolvedValue(undefined),
}))

const uploadCustomIconsMock = vi.mocked(uploadCustomIcons)
const refreshCustomIconCachesMock = vi.mocked(refreshCustomIconCaches)

const uploadedIcon: CustomIconItem = {
  icon: 'acme:logo',
  prefix: 'acme',
  name: 'logo',
  setName: 'Acme Icons',
  body: '<path d="M0 0h24v24H0z"/>',
  width: 24,
  height: 24,
  keywords: [],
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
}

function createUploadResult(
  overrides: Partial<CustomIconUploadResponse> = {},
): CustomIconUploadResponse {
  return {
    created: [uploadedIcon],
    replaced: [],
    skipped: [],
    failed: [],
    ...overrides,
  }
}

function mountDrawer(props = { show: true, prefix: 'acme' as string | null }) {
  const { plugins } = createTestQueryHarness()

  return mount(IconUploadDrawer, {
    props,
    attachTo: document.body,
    global: {
      plugins,
      stubs: {
        teleport: true,
      },
    },
  })
}

async function selectFiles(wrapper: ReturnType<typeof mountDrawer>, ...files: File[]) {
  const fileList: UploadFileInfo[] = files.map((file, index) => ({
    id: `upload-${index}`,
    name: file.name,
    status: 'pending',
    file,
  }))

  wrapper.getComponent(NUpload).vm.$emit('update:file-list', fileList)
  await flushPromises()
}

async function submitUpload(wrapper: ReturnType<typeof mountDrawer>) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === '上传')

  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

describe('IconUploadDrawer', () => {
  beforeEach(() => {
    uploadCustomIconsMock.mockReset()
    refreshCustomIconCachesMock.mockClear()
  })

  it('uploads selected files and closes after a complete success', async () => {
    const result = createUploadResult()
    uploadCustomIconsMock.mockResolvedValue(result)
    const wrapper = mountDrawer()
    const files = [
      new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }),
      new File(['<svg />'], 'mark.svg', { type: 'image/svg+xml' }),
    ]

    await selectFiles(wrapper, ...files)
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).toHaveBeenCalledWith('acme', {
      duplicateStrategy: 'skip',
      files,
    })
    expect(wrapper.emitted('uploaded')).toEqual([[result]])
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('keeps partial upload results visible with the selected duplicate strategy', async () => {
    const result = createUploadResult({
      created: [],
      replaced: [uploadedIcon],
      skipped: [{ name: 'existing', sourceFilename: 'existing.svg', reason: 'duplicate' }],
      failed: [{ sourceFilename: 'broken.svg', message: 'SVG 无效' }],
    })
    uploadCustomIconsMock.mockResolvedValue(result)
    const wrapper = mountDrawer()
    const file = new File(['<svg />'], 'existing.svg', { type: 'image/svg+xml' })

    wrapper.getComponent(NRadioGroup).vm.$emit('update:value', 'replace')
    await selectFiles(wrapper, file)
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).toHaveBeenCalledWith('acme', {
      duplicateStrategy: 'replace',
      files: [file],
    })
    expect(wrapper.text()).toContain('新增 0')
    expect(wrapper.text()).toContain('替换 1')
    expect(wrapper.text()).toContain('跳过 1')
    expect(wrapper.text()).toContain('失败 1')
    expect(wrapper.emitted('uploaded')).toEqual([[result]])
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('shows upload errors and keeps the drawer open', async () => {
    uploadCustomIconsMock.mockRejectedValue(new Error('上传服务不可用'))
    const wrapper = mountDrawer()

    await selectFiles(wrapper, new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }))
    await submitUpload(wrapper)

    expect(wrapper.text()).toContain('上传服务不可用')
    expect(wrapper.emitted('uploaded')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('ignores stale upload results after switching icon sets', async () => {
    const pendingUpload = createDeferred<CustomIconUploadResponse>()
    uploadCustomIconsMock.mockImplementationOnce(() => pendingUpload.promise)
    const wrapper = mountDrawer()

    await selectFiles(wrapper, new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }))
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).toHaveBeenCalledOnce()

    await wrapper.setProps({ show: true, prefix: 'nova' })
    await flushPromises()

    pendingUpload.resolve(createUploadResult())
    await flushPromises()

    expect(wrapper.text()).not.toContain('上传结果')
    expect(wrapper.emitted('uploaded')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(refreshCustomIconCachesMock).toHaveBeenCalledOnce()
  })

  it('does not invalidate caches when every upload item was skipped or failed', async () => {
    uploadCustomIconsMock.mockResolvedValue(
      createUploadResult({
        created: [],
        skipped: [{ name: 'logo', sourceFilename: 'logo.svg', reason: 'duplicate' }],
      }),
    )
    const wrapper = mountDrawer()

    await selectFiles(wrapper, new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }))
    await submitUpload(wrapper)

    expect(refreshCustomIconCachesMock).not.toHaveBeenCalled()
  })

  it('does not upload without both a target icon set and files', async () => {
    const wrapper = mountDrawer()

    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).not.toHaveBeenCalled()

    await selectFiles(wrapper, new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' }))
    await wrapper.setProps({ show: true, prefix: null })
    await flushPromises()
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).not.toHaveBeenCalled()
  })

  it('keeps keywords aligned by stable file id after duplicate names are reordered', async () => {
    uploadCustomIconsMock.mockResolvedValue(createUploadResult())
    const wrapper = mountDrawer()
    const first = new File(['<svg id="first" />'], 'logo.svg', { type: 'image/svg+xml' })
    const second = new File(['<svg id="second" />'], 'logo.svg', { type: 'image/svg+xml' })
    const upload = wrapper.getComponent(NUpload)
    const firstInfo: UploadFileInfo = {
      id: 'first-id',
      name: first.name,
      status: 'pending',
      file: first,
    }
    const secondInfo: UploadFileInfo = {
      id: 'second-id',
      name: second.name,
      status: 'pending',
      file: second,
    }

    upload.vm.$emit('update:file-list', [firstInfo, secondInfo])
    await flushPromises()
    wrapper
      .get('[data-test="icon-upload-file"][data-file-id="first-id"]')
      .findComponent(IconKeywordsInput)
      .vm.$emit('update:modelValue', ['first keyword'])
    wrapper
      .get('[data-test="icon-upload-file"][data-file-id="second-id"]')
      .findComponent(IconKeywordsInput)
      .vm.$emit('clear')
    await flushPromises()

    wrapper.getComponent(NUpload).vm.$emit('update:file-list', [secondInfo, firstInfo])
    await flushPromises()
    expect(
      wrapper
        .findAll('[data-test="icon-upload-file"]')
        .map((item) => item.attributes('data-file-id')),
    ).toEqual(['second-id', 'first-id'])
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).toHaveBeenCalledWith('acme', {
      duplicateStrategy: 'skip',
      files: [second, first],
      metadata: [{ keywords: [] }, { keywords: ['first keyword'] }],
    })
  })

  it('omits untouched empty keywords and validates edited keywords before uploading', async () => {
    uploadCustomIconsMock.mockResolvedValue(createUploadResult())
    const wrapper = mountDrawer()
    const untouched = new File(['<svg />'], 'untouched.svg', { type: 'image/svg+xml' })
    const edited = new File(['<svg />'], 'edited.svg', { type: 'image/svg+xml' })

    await selectFiles(wrapper, untouched, edited)
    wrapper.findAllComponents(IconKeywordsInput)[1]!.vm.$emit('update:modelValue', ['!!!'])
    await flushPromises()
    await submitUpload(wrapper)

    expect(wrapper.text()).toContain('关键词必须包含文字或数字')
    expect(uploadCustomIconsMock).not.toHaveBeenCalled()

    wrapper.findAllComponents(IconKeywordsInput)[1]!.vm.$emit('update:modelValue', ['  用户  '])
    await flushPromises()
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).toHaveBeenCalledWith('acme', {
      duplicateStrategy: 'skip',
      files: [untouched, edited],
      metadata: [{}, { keywords: ['用户'] }],
    })
  })
})
