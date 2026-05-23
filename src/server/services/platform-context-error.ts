export class PlatformContextError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number
  ) {
    super(message);
    this.name = "PlatformContextError";
    // Maintain prototype chain
    Object.setPrototypeOf(this, PlatformContextError.prototype);
  }
}
