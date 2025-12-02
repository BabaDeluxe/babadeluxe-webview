// TODO Add to shared and implement this on backend too
export class BaseError extends Error {
  public readonly namespace: string

  constructor(
    public message: string,
    public readonly cause?: Error,
    public readonly namespaceOverride?: string
  ) {
    const namespace = namespaceOverride || new.target.name.replace(/Error$/, '')
    super(`[${namespace} ${message}`)
    this.name = new.target.name
    this.namespace = namespace
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * Overrides the default toString() to provide a rich, multi-line log
   * message including the stack trace and any causal errors.
   */
  public toString(): string {
    let output = this.stack || `${this.name}: ${this.message}`

    if (this.cause) {
      // Recursively create a detailed report for the entire error chain.
      const causeString = String(this.cause)
      output += `\n\nCaused by:\n${causeString}`
    }

    return output
  }
}

// Usage - just extend and throw!
// class ModelsFetchError extends BaseAppError {}
// class PostMessageError extends BaseAppError {}

// throw new ModelsFetchError('Connection failed', originalError)
// Output: [ModelsFetch] Connection failed
