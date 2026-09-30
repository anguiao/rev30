import { computed, onUnmounted, reactive, ref } from 'vue'
import type { RichTextImageAttrs } from '../editor'

export const maxImageCandidates = 20

type ImageSource = 'local' | 'library' | 'existing'
type ReadState = 'loading' | 'ready' | 'error'
type UploadState = 'pending' | 'uploading' | 'uploaded' | 'error'

export interface ImageLibraryItem {
  readonly src: string
  readonly name: string
}

export interface ImageCandidate {
  readonly id: number
  readonly source: ImageSource
  readonly name: string
  readonly file: File | null
  src: string | null
  previewSrc: string
  objectUrl: string | null
  alt: string
  width: number | null
  height: number | null
  naturalSize: { width: number; height: number } | null
  readState: ReadState
  uploadState: UploadState
}

interface ImageDialogSessionOptions {
  readonly upload: (file: File) => Promise<{ src: string }>
  readonly existingImage?: RichTextImageAttrs | undefined
  readonly initialImageFiles?: readonly File[] | undefined
  readonly onError?: ((error: unknown) => void) | undefined
}

function readNaturalSize(src: string, signal: AbortSignal) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    function cleanup() {
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', abort)
    }
    function abort() {
      cleanup()
      image.src = ''
      reject(new DOMException('Image read canceled', 'AbortError'))
    }
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight }
      cleanup()
      if (size.width <= 0 || size.height <= 0) {
        reject(new Error('图片尺寸无效'))
      } else {
        resolve(size)
      }
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('图片加载失败'))
    }
    signal.addEventListener('abort', abort, { once: true })
    image.src = src
  })
}

function fittedHeight(width: number, naturalSize: { width: number; height: number }) {
  return Math.max(1, Math.round((width * naturalSize.height) / naturalSize.width))
}

function fittedWidth(height: number, naturalSize: { width: number; height: number }) {
  return Math.max(1, Math.round((height * naturalSize.width) / naturalSize.height))
}

function validSize(value: number | null) {
  return value !== null && Number.isInteger(value) && value > 0
}

export function useImageDialogSession(options: ImageDialogSessionOptions) {
  const isEditing = options.existingImage !== undefined
  const candidates = ref<ImageCandidate[]>([])
  const selectedId = ref<number | null>(null)
  const message = ref('')
  const isUploading = ref(false)
  const selected = computed(
    () => candidates.value.find((item) => item.id === selectedId.value) ?? null,
  )
  const localToUploadCount = computed(
    () => candidates.value.filter((item) => item.source === 'local' && item.src === null).length,
  )
  const canSubmit = computed(
    () =>
      !isUploading.value &&
      candidates.value.length > 0 &&
      candidates.value.every(
        (item) => item.readState === 'ready' && validSize(item.width) && validSize(item.height),
      ),
  )
  const readers = new Map<number, AbortController>()
  let nextId = 0
  let disposed = false
  let editWidth = options.existingImage?.width ?? null

  function isCurrent(item: ImageCandidate) {
    return !disposed && candidates.value.some((candidate) => candidate.id === item.id)
  }

  function release(item: ImageCandidate) {
    readers.get(item.id)?.abort()
    readers.delete(item.id)
    if (item.objectUrl !== null) {
      URL.revokeObjectURL(item.objectUrl)
      item.objectUrl = null
    }
  }

  async function read(item: ImageCandidate) {
    readers.get(item.id)?.abort()
    const controller = new AbortController()
    readers.set(item.id, controller)
    item.readState = 'loading'
    try {
      const size = await readNaturalSize(item.previewSrc, controller.signal)
      if (!isCurrent(item) || controller.signal.aborted) return false
      const preserveDisplaySize = item.source === 'local' && item.src !== null
      item.readState = 'ready'
      if (!preserveDisplaySize) {
        item.naturalSize = size
        if (item.width === null && item.height === null) {
          item.width = size.width
          item.height = size.height
        } else if (item.width !== null && item.height === null) {
          item.height = fittedHeight(item.width, size)
        } else if (item.width === null && item.height !== null) {
          item.width = fittedWidth(item.height, size)
        }
      }
      if (item.src !== null && item.objectUrl !== null) {
        URL.revokeObjectURL(item.objectUrl)
        item.objectUrl = null
      }
      return true
    } catch (error) {
      if (!isCurrent(item) || controller.signal.aborted) return false
      item.readState = 'error'
      message.value = isEditing ? '图片读取失败，请重试或替换' : '图片读取失败，请重试或移除'
      options.onError?.(error)
      return false
    } finally {
      if (readers.get(item.id) === controller) readers.delete(item.id)
    }
  }

  function createLocal(file: File, alt = file.name, width: number | null = null) {
    const objectUrl = URL.createObjectURL(file)
    const item = reactive<ImageCandidate>({
      id: ++nextId,
      source: 'local',
      name: file.name,
      file,
      src: null,
      previewSrc: objectUrl,
      objectUrl,
      alt,
      width,
      height: null,
      naturalSize: null,
      readState: 'loading',
      uploadState: 'pending',
    })
    return item
  }

  function createRemote(
    source: 'library' | 'existing',
    image: ImageLibraryItem,
    attrs?: RichTextImageAttrs,
  ) {
    const item = reactive<ImageCandidate>({
      id: ++nextId,
      source,
      name: image.name,
      file: null,
      src: image.src,
      previewSrc: image.src,
      objectUrl: null,
      alt: attrs === undefined ? image.name : (attrs.alt ?? ''),
      width: attrs?.width ?? null,
      height: attrs?.height ?? null,
      naturalSize: null,
      readState: 'loading',
      uploadState: 'uploaded',
    })
    return item
  }

  function addLocalFiles(files: readonly File[]) {
    if (disposed || isUploading.value || files.length === 0) return
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      message.value = '请选择图片文件'
      return
    }
    if (isEditing) {
      if (images.length !== 1) {
        message.value = '请选择一张图片'
        return
      }
      const previous = selected.value
      const candidate = createLocal(images[0]!, previous?.alt ?? '', editWidth)
      if (previous !== null) release(previous)
      candidates.value = [candidate]
      selectedId.value = candidate.id
      message.value = images.length < files.length ? '已忽略非图片文件' : ''
      void read(candidate)
      return
    }
    const available = maxImageCandidates - candidates.value.length
    if (images.length > available) {
      message.value =
        available === 0
          ? '已选择 20 张图片，请先移除再添加'
          : `最多选择 20 张图片，还可添加 ${available} 张`
      return
    }
    const added = images.map((file) => createLocal(file))
    candidates.value.push(...added)
    selectedId.value = added[0]!.id
    message.value = images.length < files.length ? '已忽略非图片文件' : ''
    for (const item of added) void read(item)
  }

  function addLibraryImage(image: ImageLibraryItem) {
    if (disposed || isUploading.value) return false
    if (isEditing) {
      const previous = selected.value
      const item = createRemote('library', image, {
        src: image.src,
        alt: previous?.alt ?? options.existingImage?.alt ?? image.name,
        width: editWidth,
        height: null,
      })
      if (previous !== null) release(previous)
      candidates.value = [item]
      selectedId.value = item.id
      message.value = ''
      void read(item)
      return true
    }
    if (candidates.value.some((item) => item.src === image.src)) return false
    if (candidates.value.length >= maxImageCandidates) {
      message.value = '已选择 20 张图片，请先移除再添加'
      return false
    }
    const item = createRemote('library', image)
    candidates.value.push(item)
    selectedId.value = item.id
    message.value = ''
    void read(item)
    return true
  }

  function removeLibraryImage(src: string) {
    const index = candidates.value.findIndex((item) => item.src === src)
    if (index !== -1) remove(index)
  }

  function select(id: number) {
    if (!isUploading.value && candidates.value.some((item) => item.id === id)) selectedId.value = id
  }

  function move(index: number, direction: -1 | 1) {
    if (disposed || isUploading.value || isEditing) return
    const next = index + direction
    if (next < 0 || next >= candidates.value.length) return
    const [item] = candidates.value.splice(index, 1)
    candidates.value.splice(next, 0, item!)
  }

  function remove(index: number) {
    if (disposed || isUploading.value || isEditing) return
    const [item] = candidates.value.splice(index, 1)
    if (item === undefined) return
    release(item)
    if (selectedId.value === item.id) {
      selectedId.value = candidates.value[index]?.id ?? candidates.value[index - 1]?.id ?? null
    }
    message.value = ''
  }

  function updateAlt(value: string) {
    if (selected.value !== null && !isUploading.value) selected.value.alt = value
  }

  function updateWidth(value: number | null) {
    const item = selected.value
    if (item === null || isUploading.value) return
    item.width = value
    if (isEditing) editWidth = value
    if (value !== null && item.naturalSize !== null)
      item.height = fittedHeight(value, item.naturalSize)
  }

  function updateHeight(value: number | null) {
    const item = selected.value
    if (item === null || isUploading.value) return
    item.height = value
    if (value !== null && item.naturalSize !== null) {
      item.width = fittedWidth(value, item.naturalSize)
      if (isEditing) editWidth = item.width
    }
  }

  function resetSize() {
    const item = selected.value
    if (item === null || isUploading.value || item.naturalSize === null) return
    item.width = item.naturalSize.width
    item.height = item.naturalSize.height
    if (isEditing) editWidth = item.width
  }

  function retryRead() {
    const item = selected.value
    if (item?.readState === 'error' && !isUploading.value) void read(item)
  }

  function attrs(item: ImageCandidate): RichTextImageAttrs {
    return { src: item.src!, alt: item.alt, width: item.width, height: item.height }
  }

  async function submit(): Promise<RichTextImageAttrs[] | null> {
    if (!canSubmit.value || disposed) return null
    isUploading.value = true
    message.value = ''
    let uploadFailures = 0
    let readFailures = 0
    for (const item of candidates.value) {
      if (disposed) return null
      if (item.source !== 'local' || item.src !== null) continue
      item.uploadState = 'uploading'
      try {
        const uploaded = await options.upload(item.file!)
        if (disposed) return null
        if (uploaded.src === '') throw new Error('图片加载失败')
        item.src = uploaded.src
        item.previewSrc = uploaded.src
        item.uploadState = 'uploaded'
        if (!(await read(item))) readFailures += 1
      } catch (error) {
        if (disposed) return null
        item.uploadState = 'error'
        uploadFailures += 1
        options.onError?.(error)
      }
    }
    if (disposed) return null
    isUploading.value = false
    if (uploadFailures + readFailures > 0) {
      const failureLabel =
        uploadFailures > 0 && readFailures > 0
          ? '上传或读取失败'
          : uploadFailures > 0
            ? '上传失败'
            : '读取失败'
      message.value = `${uploadFailures + readFailures} 张图片${failureLabel}，${isEditing ? '请重试' : '请重试或移除'}`
      return null
    }
    if (!canSubmit.value || candidates.value.some((item) => item.src === null)) return null
    return candidates.value.map(attrs)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    for (const item of candidates.value) release(item)
    candidates.value = []
  }

  if (options.existingImage !== undefined) {
    const item = createRemote(
      'existing',
      {
        src: options.existingImage.src,
        name: options.existingImage.alt ?? '当前图片',
      },
      options.existingImage,
    )
    candidates.value = [item]
    selectedId.value = item.id
    void read(item)
  }
  if (options.initialImageFiles !== undefined) addLocalFiles(options.initialImageFiles)

  onUnmounted(dispose)

  return {
    isEditing,
    candidates,
    selected,
    selectedId,
    message,
    isUploading,
    localToUploadCount,
    canSubmit,
    addLocalFiles,
    addLibraryImage,
    removeLibraryImage,
    select,
    move,
    remove,
    updateAlt,
    updateWidth,
    updateHeight,
    resetSize,
    retryRead,
    submit,
    dispose,
  }
}
