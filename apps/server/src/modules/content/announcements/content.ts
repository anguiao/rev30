import { parseAnnouncementContent } from '@rev30/shared/utils/announcement-content'
import { AnnouncementContentInvalidError, AnnouncementEmptyContentError } from './errors'

export function deriveAnnouncementContentText(contentJson: unknown) {
  const result = parseAnnouncementContent(contentJson)

  if (result.success) {
    return result.text
  }

  if (result.reason === 'empty') {
    throw new AnnouncementEmptyContentError()
  }

  throw new AnnouncementContentInvalidError()
}
