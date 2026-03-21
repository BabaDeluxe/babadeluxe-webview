import type { LogLevel } from 'colorino'
import { createColorino, themePalettes } from 'colorino'

type ColorinoLogger = ReturnType<typeof createColorino>

export interface AbstractLogger {
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  log(...args: unknown[]): void
  trace(...args: unknown[]): void
}

interface AppLoggerOptions {
  /**
   * Append file path and line number at the end of log messages.
   * Example: `[ChatView:123]`
   * @default true
   */
  areFileLinksShown?: boolean

  /**
   * Prepend caller function name or file name at the beginning of log messages.
   * Example: `[handleSendMessage]` or `[ChatView]`
   * @default false
   */
  isCallerPrefixShown?: boolean

  /**
   * Enable stack trace parsing for all log levels.
   * If false, only 'error' and 'warn' will have stack frames.
   * @default false
   */
  isStackParsingEnabledAllLevels?: boolean
}

interface StackFrame {
  functionName?: string
  filePath?: string
  lineNumber?: number
}

export class AppLogger implements AbstractLogger {
  private readonly _logger: ColorinoLogger
  private readonly _areFileLinksShown: boolean
  private readonly _isCallerPrefixShown: boolean
  private readonly _isStackParsingEnabledAllLevels: boolean

  constructor(options: AppLoggerOptions = {}) {
    this._logger = createColorino(themePalettes['catppuccin-mocha'])
    this._areFileLinksShown = options.areFileLinksShown ?? true
    this._isCallerPrefixShown = options.isCallerPrefixShown ?? false
    this._isStackParsingEnabledAllLevels = options.isStackParsingEnabledAllLevels ?? false
  }

  info(...args: unknown[]): void {
    this._log('info', args)
  }

  debug(...args: unknown[]): void {
    this._log('debug', args)
  }

  warn(...args: unknown[]): void {
    this._log('warn', args)
  }

  error(...args: unknown[]): void {
    this._log('error', args)
  }

  log(...args: unknown[]): void {
    this._log('log', args)
  }

  trace(...args: unknown[]): void {
    this._log('trace', args)
  }

  private _log(level: LogLevel, args: unknown[]): void {
    if (args.length === 0) {
      this._logger[level]('')
      return
    }

    const finalArguments: unknown[] = []
    const shouldParseStack = this._isStackParsingEnabledAllLevels || level === 'error' || level === 'warn'
    const callerFrame = shouldParseStack ? this._getCallerFrame() : undefined

    if (this._isCallerPrefixShown) {
      const prefix = callerFrame && this._buildCallerPrefix(callerFrame)
      if (prefix) finalArguments.push(`[${prefix}]`)
    }

    finalArguments.push(...args)

    if (this._areFileLinksShown) {
      const fileLink = callerFrame && this._buildFileLink(callerFrame)
      if (fileLink) finalArguments.push(`[${fileLink}]`)
    }

    this._logger[level](...finalArguments)
  }

  /**
   * Picks the most relevant stack frame representing the external caller
   * (the function that called info/debug/warn/etc.).
   */
  private _getCallerFrame(): StackFrame | undefined {
    const stack = new Error().stack
    if (!stack) return undefined

    const lines = stack.split('\n')

    // Stack position description from your original comment:
    // [0]=Error, [1]=_getCallerPrefix/_getFileLink, [2]=_log, [3]=info/debug/etc, [4]=actual caller
    // In some environments there may be an extra frame, so we try a small range.
    const candidateLines = [4, 5, 3]
      .map((index) => lines[index])
      .filter((line): line is string => Boolean(line))

    for (const line of candidateLines) {
      const parsed = this._parseStackLine(line)
      if (parsed) return parsed
    }

    return undefined
  }

  /**
   * Parses a single stack line into a StackFrame, supporting both Chrome-like and Firefox-like formats.
   */
  private _parseStackLine(line: string): StackFrame | undefined {
    // Chrome / Node style with function: "    at fnName (path/to/file:12:34)"
    const chromeMatch =
      /at (?:async )?(\S+?) \((.+):(\d+):(\d+)\)/.exec(line) ||
      // Chrome / Node style without function: "    at path/to/file:12:34"
      /at (.+):(\d+):(\d+)/.exec(line)

    if (chromeMatch) {
      if (chromeMatch.length === 5) {
        const functionName = chromeMatch[1]
        const filePath = chromeMatch[2]
        const lineNumber = Number.parseInt(chromeMatch[3], 10)
        return { functionName, filePath, lineNumber }
      }

      if (chromeMatch.length === 4) {
        const filePath = chromeMatch[1]
        const lineNumber = Number.parseInt(chromeMatch[2], 10)
        return { filePath, lineNumber }
      }
    }

    // Firefox style: "fnName@path/to/file:12:34" or "@path/to/file:12:34"
    const firefoxMatch = /^(?:(\S+?)@)?(.+):(\d+):(\d+)/.exec(line)

    if (firefoxMatch) {
      const functionName = firefoxMatch[1]
      const filePath = firefoxMatch[2]
      const lineNumber = Number.parseInt(firefoxMatch[3], 10)
      return { functionName, filePath, lineNumber }
    }

    return undefined
  }

  private _buildCallerPrefix(frame: StackFrame): string | undefined {
    if (frame.functionName && frame.functionName !== '<anonymous>') {
      return frame.functionName
    }

    if (!frame.filePath) return undefined

    return this._baseNameWithoutExtension(frame.filePath)
  }

  /**
   * Returns format like `ChatView:123` or `use-chat-socket:45`.
   */
  private _buildFileLink(frame: StackFrame): string | undefined {
    if (!frame.filePath || !frame.lineNumber) return undefined

    const baseName = this._baseNameWithoutExtension(frame.filePath) ?? 'unknown'
    return `${baseName}:${frame.lineNumber}`
  }

  private _baseNameWithoutExtension(filePath: string): string | undefined {
    const fileName = filePath
      .split('/')
      .pop()
      ?.replace(/\?.*$/, '')
      ?.replace(/^webpack-internal:\/\/\//, '')
      ?.trim()

    if (!fileName) return undefined

    return fileName.replace(/\.(vue|ts|js|tsx|jsx)$/, '')
  }
}

export const logger = new AppLogger()
