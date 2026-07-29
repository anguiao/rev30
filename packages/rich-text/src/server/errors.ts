export class RichTextContentInvalidError extends Error {
  constructor(options?: ErrorOptions) {
    super('Rich text content is invalid', options)
  }
}

export class RichTextDocumentInvalidError extends Error {}
