export class FormFieldError<TField extends string = string> extends Error {
  constructor(
    message: string,
    public readonly field: TField,
  ) {
    super(message)
    this.name = new.target.name
  }
}
