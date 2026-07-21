import { config, enableAutoUnmount } from '@vue/test-utils'
import { afterEach } from 'vitest'
import { createTestRichTextOverlayState } from './helpers/overlay'

enableAutoUnmount(afterEach)
config.global.provide = createTestRichTextOverlayState().provide
