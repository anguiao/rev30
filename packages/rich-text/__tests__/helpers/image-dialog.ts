import type { VueWrapper } from '@vue/test-utils'
import type { UseDropZoneOptions, UseFileDialogOptions } from '@vueuse/core'
import { nextTick } from 'vue'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import type { RichTextImageLibraryResult } from '../../src/features/image/client/vue'
import { createClipboardEvent, createFileList } from './clipboard'

type FileDialogChangeHandler = (files: FileList | null) => void
const pickerMock = vi.hoisted(() => ({
  open: vi.fn<() => void>(),
  fileOptions: [] as UseFileDialogOptions[],
  fileChanges: [] as FileDialogChangeHandler[],
  dropOptions: [] as UseDropZoneOptions[],
}))
export const picker = pickerMock
export const objectUrls = {
  create: vi.fn<typeof URL.createObjectURL>(),
  revoke: vi.fn<typeof URL.revokeObjectURL>(),
}

vi.mock('@vueuse/core', async (importOriginal) => {
  const vueuse = await importOriginal<typeof import('@vueuse/core')>()
  return {
    ...vueuse,
    useFileDialog: vi.fn((options: UseFileDialogOptions) => {
      picker.fileOptions.push(options)
      return {
        files: { value: null },
        open: picker.open,
        reset: vi.fn(),
        onChange: (handler: FileDialogChangeHandler) => picker.fileChanges.push(handler),
      }
    }),
    useDropZone: vi.fn((_target: unknown, options: UseDropZoneOptions) => {
      picker.dropOptions.push(options)
      return { files: { value: null }, isOverDropZone: { value: false } }
    }),
  }
})

export class PreviewImage {
  static pending: PreviewImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private value = ''

  set src(value: string) {
    this.value = value
    if (value !== '') PreviewImage.pending.push(this)
  }

  get src() {
    return this.value
  }

  static finish(src: string, width = 800, height = 400) {
    const image = PreviewImage.pending.find((entry) => entry.src === src)
    if (image === undefined) throw new Error(`No pending image: ${src}`)
    PreviewImage.pending.splice(PreviewImage.pending.indexOf(image), 1)
    image.naturalWidth = width
    image.naturalHeight = height
    image.onload?.()
  }

  static fail(src: string) {
    const image = PreviewImage.pending.find((entry) => entry.src === src)
    if (image === undefined) throw new Error(`No pending image: ${src}`)
    PreviewImage.pending.splice(PreviewImage.pending.indexOf(image), 1)
    image.onerror?.()
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export function file(name: string) {
  return new File(['image'], name, { type: 'image/png' })
}

export function libraryResult(
  list: RichTextImageLibraryResult['list'],
  page = 1,
  total = list.length,
): RichTextImageLibraryResult {
  return { list, total, page, pageSize: 20 }
}

export async function selectSource(wrapper: VueWrapper, label: string) {
  await wrapper.get('[data-test="rich-text-image-source"]').trigger('click')
  const option = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === label)
  expect(option).toBeDefined()
  await option!.trigger('click')
}

export async function chooseFiles(files: File[]) {
  const change = picker.fileChanges.at(-1)
  if (change === undefined) throw new Error('File picker is not registered')
  change(createFileList(files))
  await nextTick()
}

export async function dropFiles(files: File[]) {
  const onDrop = picker.dropOptions.at(-1)?.onDrop
  if (onDrop === undefined) throw new Error('Drop zone is not registered')
  onDrop(files, new DragEvent('drop'))
  await nextTick()
}

export async function pasteFiles(files: File[], target: Element) {
  const event = createClipboardEvent({ files })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

beforeEach(() => {
  picker.open.mockReset()
  PreviewImage.pending = []
  let nextUrl = 0
  objectUrls.create.mockReset().mockImplementation(() => `blob:image-${++nextUrl}`)
  objectUrls.revoke.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(objectUrls.create)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(objectUrls.revoke)
  vi.stubGlobal('Image', PreviewImage)
})

afterEach(() => {
  picker.fileOptions.length = 0
  picker.fileChanges.length = 0
  picker.dropOptions.length = 0
  vi.unstubAllGlobals()
})
