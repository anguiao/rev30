import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NDrawerContent, NRadioGroup, NUpload } from 'naive-ui'
import type {
  CustomIconItem,
  CustomIconUploadResponse,
  CustomIconUploadResult,
} from '@rev30/contracts'
import { uploadCustomIcons } from '../../../../src/features/icons/requests'
import IconUploadDrawer from '../../../../src/features/icons/forms/IconUploadDrawer.vue'
import IconKeywordsInput from '../../../../src/features/icons/forms/IconKeywordsInput.vue'
import { createTestQueryHarness } from '../../../helpers/colada'
import { createDeferred } from '../../../helpers/promise'
import { refreshCustomIconCaches } from '../../../../src/features/icons/cache'

vi.mock('../../../../src/features/icons/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/features/icons/requests')>()),
  uploadCustomIcons: vi.fn(),
}))

vi.mock('../../../../src/features/icons/cache', () => ({
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

function result(...results: CustomIconUploadResult[]): CustomIconUploadResponse {
  return { results }
}

function svgFile(name = 'logo.svg', content = '<svg />') {
  return new File([content], name, { type: 'image/svg+xml' })
}

function mountDrawer(props = { show: true, prefix: 'acme' as string | null }) {
  const { plugins } = createTestQueryHarness()

  return mount(IconUploadDrawer, {
    props,
    attachTo: document.body,
    global: {
      plugins,
      stubs: { teleport: true },
    },
  })
}

type TestWrapper = VueWrapper | DOMWrapper<Element>

async function selectFiles(wrapper: TestWrapper, ...files: File[]) {
  const input = wrapper.getComponent(NUpload).get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: files })
  await input.trigger('change')
  await flushPromises()
}

function button(wrapper: TestWrapper, text: string | RegExp) {
  const match = wrapper
    .findAll('button')
    .find((candidate) =>
      typeof text === 'string' ? candidate.text() === text : text.test(candidate.text()),
    )
  expect(match).toBeDefined()
  return match!
}

function rows(wrapper: TestWrapper) {
  return wrapper.findAll('li[aria-label]')
}

async function clickButton(wrapper: TestWrapper, text: string | RegExp) {
  await button(wrapper, text).trigger('click')
  await flushPromises()
}

async function submitUpload(wrapper: TestWrapper) {
  await clickButton(wrapper, /^上传 \d+ 个文件$/)
}

async function editKeywords(row: TestWrapper, keywords: string[]) {
  await clickButton(row, '添加关键词')
  row.getComponent(IconKeywordsInput).vm.$emit('update:modelValue', keywords)
  await flushPromises()
}

describe('IconUploadDrawer', () => {
  beforeEach(() => {
    uploadCustomIconsMock.mockReset()
    refreshCustomIconCachesMock.mockClear()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:icon-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('keeps successful files in the same list and only uploads newly added files', async () => {
    uploadCustomIconsMock.mockResolvedValue(result({ status: 'created', icon: uploadedIcon }))
    const wrapper = mountDrawer()
    const first = svgFile()
    const second = svgFile('mark.svg')

    await selectFiles(wrapper, first)
    expect(rows(wrapper)).toHaveLength(1)
    expect(rows(wrapper)[0]!.text()).toContain('未设置关键词')
    expect(wrapper.findComponent(IconKeywordsInput).exists()).toBe(false)
    expect(wrapper.getComponent(NUpload).props('showFileList')).toBe(false)
    await submitUpload(wrapper)

    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'skip',
      files: [first],
    })
    expect(rows(wrapper)[0]!.text()).toContain('已新增')
    expect(rows(wrapper)[0]!.findAll('button')).toHaveLength(0)
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(refreshCustomIconCachesMock).toHaveBeenCalledOnce()

    await selectFiles(wrapper, second)
    await submitUpload(wrapper)
    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'skip',
      files: [second],
    })
    expect(rows(wrapper)).toHaveLength(2)
    expect(wrapper.get('[role="status"]').text()).toBe('新增 2')
    await clickButton(wrapper, '完成')
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('matches same-name results by position, replaces one skipped file, and reselects a failed file', async () => {
    uploadCustomIconsMock.mockResolvedValueOnce(
      result(
        { status: 'created', icon: uploadedIcon },
        { status: 'skipped', name: 'logo', reason: 'duplicate' },
        { status: 'failed', message: 'SVG 无效' },
      ),
    )
    const wrapper = mountDrawer()
    const files = [svgFile(), svgFile(), svgFile('logo.svg', 'broken')]
    await selectFiles(wrapper, ...files)
    await editKeywords(rows(wrapper)[2]!, ['保留关键词'])
    await submitUpload(wrapper)

    expect(rows(wrapper).map((row) => row.text())).toEqual([
      expect.stringContaining('已新增'),
      expect.stringContaining('已跳过'),
      expect.stringContaining('SVG 无效'),
    ])
    expect(wrapper.get('[role="status"]').text()).toBe('新增 1 · 跳过 1 · 失败 1')

    uploadCustomIconsMock.mockResolvedValueOnce(
      result({
        status: 'replaced',
        icon: { ...uploadedIcon, keywords: ['原关键词'] },
      }),
    )
    await clickButton(rows(wrapper)[1]!, '替换此项')
    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'replace',
      files: [files[1]],
    })
    expect(rows(wrapper)[1]!.text()).toContain('已替换')
    expect(rows(wrapper)[1]!.text()).toContain('原关键词')

    const replacement = svgFile('fixed.svg')
    await selectFiles(rows(wrapper)[2]!, replacement)
    expect(rows(wrapper)[2]!.text()).toContain('fixed.svg')
    expect(rows(wrapper)[2]!.text()).toContain('待上传')
    expect(rows(wrapper)[2]!.text()).toContain('保留关键词')
    expect(rows(wrapper)[2]!.text()).not.toContain('SVG 无效')
    uploadCustomIconsMock.mockResolvedValueOnce(result({ status: 'created', icon: uploadedIcon }))
    await submitUpload(wrapper)
    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'skip',
      files: [replacement],
      metadata: [{ keywords: ['保留关键词'] }],
    })
  })

  it('shows request errors and lets pending files be retried without changing earlier results', async () => {
    uploadCustomIconsMock
      .mockResolvedValueOnce(result({ status: 'created', icon: uploadedIcon }))
      .mockRejectedValueOnce(new Error('上传服务不可用'))
      .mockResolvedValueOnce(result({ status: 'created', icon: uploadedIcon }))
    const wrapper = mountDrawer()
    await selectFiles(wrapper, svgFile())
    await submitUpload(wrapper)
    const retryFile = svgFile('retry.svg')
    await selectFiles(wrapper, retryFile)
    await editKeywords(rows(wrapper)[1]!, ['重试'])
    await submitUpload(wrapper)

    expect(wrapper.text()).toContain('上传服务不可用')
    expect(rows(wrapper)[0]!.text()).toContain('已新增')
    expect(rows(wrapper)[1]!.text()).toContain('待上传')
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(refreshCustomIconCachesMock).toHaveBeenCalledTimes(2)

    await submitUpload(wrapper)
    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'skip',
      files: [retryFile],
      metadata: [{ keywords: ['重试'] }],
    })
    expect(wrapper.text()).not.toContain('上传服务不可用')
  })

  it.each(['success', 'error'] as const)(
    'ignores stale %s after switching away and back to the same set',
    async (outcome) => {
      const previous = createDeferred<CustomIconUploadResponse>()
      const current = createDeferred<CustomIconUploadResponse>()
      uploadCustomIconsMock
        .mockImplementationOnce(() => previous.promise)
        .mockImplementationOnce(() => current.promise)
      const wrapper = mountDrawer()
      await selectFiles(wrapper, svgFile('old.svg'))
      await submitUpload(wrapper)
      await wrapper.setProps({ prefix: 'nova' })
      await wrapper.setProps({ prefix: 'acme' })
      await selectFiles(wrapper, svgFile('current.svg'))
      await submitUpload(wrapper)

      if (outcome === 'success') previous.resolve(result({ status: 'created', icon: uploadedIcon }))
      else previous.reject(new Error('旧请求失败'))
      await flushPromises()

      expect(rows(wrapper)).toHaveLength(1)
      expect(rows(wrapper)[0]!.text()).toContain('current.svg')
      expect(rows(wrapper)[0]!.text()).toContain('上传中')
      expect(wrapper.text()).not.toContain('旧请求失败')
      expect(wrapper.emitted('update:show')).toBeUndefined()
      expect(refreshCustomIconCachesMock).toHaveBeenCalledOnce()
      current.resolve(result({ status: 'created', icon: uploadedIcon }))
      await flushPromises()
      expect(rows(wrapper)[0]!.text()).toContain('已新增')
    },
  )

  it('locks editing, file selection, duplicate strategy, and closing while uploading', async () => {
    const pending = createDeferred<CustomIconUploadResponse>()
    uploadCustomIconsMock.mockReturnValueOnce(pending.promise)
    const wrapper = mountDrawer()
    await selectFiles(wrapper, svgFile())
    await editKeywords(rows(wrapper)[0]!, ['关键词'])
    await submitUpload(wrapper)

    expect(wrapper.getComponent(NUpload).props('disabled')).toBe(true)
    expect(wrapper.getComponent(NRadioGroup).props('disabled')).toBe(true)
    expect(wrapper.getComponent(NDrawerContent).props('closable')).toBe(false)
    expect(wrapper.findComponent(IconKeywordsInput).exists()).toBe(false)
    expect(wrapper.findAll('button').every((button) => button.element.disabled)).toBe(true)
    await clickButton(wrapper, '上传中…')
    expect(uploadCustomIconsMock).toHaveBeenCalledOnce()

    pending.resolve(result({ status: 'failed', message: 'SVG 无效' }))
    await flushPromises()
    expect(wrapper.getComponent(NDrawerContent).props('closable')).toBe(true)
    expect(wrapper.getComponent(NUpload).props('disabled')).toBe(false)
  })

  it('does not invalidate caches when every file is skipped or failed', async () => {
    uploadCustomIconsMock.mockResolvedValue(
      result(
        { status: 'skipped', name: 'logo', reason: 'duplicate' },
        { status: 'failed', message: 'SVG 无效' },
      ),
    )
    const wrapper = mountDrawer()
    await selectFiles(wrapper, svgFile(), svgFile('bad.svg'))
    await submitUpload(wrapper)
    expect(refreshCustomIconCachesMock).not.toHaveBeenCalled()
  })

  it('disables submitting without both a target icon set and files', async () => {
    const wrapper = mountDrawer({ show: true, prefix: null })
    expect(button(wrapper, '完成').element.disabled).toBe(true)
    await selectFiles(wrapper, svgFile())
    expect(button(wrapper, '上传 1 个文件').element.disabled).toBe(true)
    await submitUpload(wrapper)
    expect(uploadCustomIconsMock).not.toHaveBeenCalled()
  })

  it('preserves per-file keywords after removing a same-name file and clearing another', async () => {
    uploadCustomIconsMock.mockResolvedValue(
      result({ status: 'created', icon: uploadedIcon }, { status: 'replaced', icon: uploadedIcon }),
    )
    const wrapper = mountDrawer()
    const files = [svgFile(), svgFile(), svgFile()]
    await selectFiles(wrapper, ...files)
    await editKeywords(rows(wrapper)[0]!, ['删除'])
    await editKeywords(rows(wrapper)[1]!, ['保留'])
    await editKeywords(rows(wrapper)[2]!, ['清空'])
    await clickButton(rows(wrapper)[2]!, '清空关键词')
    expect(rows(wrapper)[2]!.text()).toContain('未设置关键词')
    expect(rows(wrapper)[2]!.text()).not.toContain('已设为空')
    await rows(wrapper)[0]!.get('button[aria-label="移除 logo.svg"]').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(2)
    wrapper.getComponent(NRadioGroup).vm.$emit('update:value', 'replace')
    await submitUpload(wrapper)
    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'replace',
      files: [files[1], files[2]],
      metadata: [{ keywords: ['保留'] }, { keywords: [] }],
    })
  })

  it('omits untouched or restored keywords and opens invalid input before uploading', async () => {
    uploadCustomIconsMock.mockResolvedValue(
      result(
        { status: 'created', icon: uploadedIcon },
        { status: 'created', icon: uploadedIcon },
        { status: 'created', icon: uploadedIcon },
      ),
    )
    const wrapper = mountDrawer()
    const files = [svgFile('untouched.svg'), svgFile('restored.svg'), svgFile('edited.svg')]
    await selectFiles(wrapper, ...files)
    await editKeywords(rows(wrapper)[1]!, ['恢复'])
    await clickButton(rows(wrapper)[1]!, '恢复默认')
    expect(rows(wrapper)[1]!.text()).toContain('未设置关键词')
    await editKeywords(rows(wrapper)[2]!, ['!!!'])
    await clickButton(rows(wrapper)[2]!, '收起')
    await submitUpload(wrapper)
    expect(rows(wrapper)[2]!.text()).toContain('关键词必须包含文字或数字')
    expect(rows(wrapper)[2]!.findComponent(IconKeywordsInput).exists()).toBe(true)
    expect(uploadCustomIconsMock).not.toHaveBeenCalled()

    rows(wrapper)[2]!.getComponent(IconKeywordsInput).vm.$emit('update:modelValue', ['  用户  '])
    await flushPromises()
    await submitUpload(wrapper)
    expect(uploadCustomIconsMock).toHaveBeenLastCalledWith('acme', {
      duplicateStrategy: 'skip',
      files,
      metadata: [{}, {}, { keywords: ['用户'] }],
    })
  })
})
