/**
 * Prompt Injection Service
 *
 * Pure, side-effect-free logic for building the final message array
 * that gets sent to the LLM, respecting the user's injection settings.
 *
 * Types and defaults are sourced from @babadeluxe/shared — do not duplicate them here.
 */

export type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '@babadeluxe/shared'
export { promptInjectionDefaults } from '@babadeluxe/shared'

import type { PromptInjectionMode, PromptInjectionPosition } from '@babadeluxe/shared'
import { promptInjectionDefaults } from '@babadeluxe/shared'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface InjectionContext {
  mode: PromptInjectionMode
  position: PromptInjectionPosition
  interval: number
  includeHistory: boolean
  /** Index (1-based) of the message currently being composed. */
  messageIndex: number
  /** Whether the active prompt changed since the last send. */
  promptChanged: boolean
  /** The fully-resolved prompt text to inject (empty string = no prompt). */
  promptText: string
}

/**
 * Determine whether the prompt should be injected at this message index,
 * given the current mode and context.
 */
export function shouldInjectPrompt(ctx: InjectionContext): boolean {
  if (!ctx.promptText) return false

  const mode = ctx.mode ?? promptInjectionDefaults.mode

  switch (mode) {
    case 'always':
      return true
    case 'first-message':
      return ctx.messageIndex === 1
    case 'every-x-messages': {
      const n = ctx.interval ?? promptInjectionDefaults.interval
      return ctx.messageIndex % n === 0 || ctx.messageIndex === 1
    }
    case 'on-prompt-change':
      return ctx.messageIndex === 1 || ctx.promptChanged
    case 'manual':
      return false
    default:
      return false
  }
}

/**
 * Build the messages array for a single LLM request.
 */
export function buildMessagesWithPrompt(
  history: ChatMessage[],
  userInput: string,
  ctx: InjectionContext
): ChatMessage[] {
  const inject = shouldInjectPrompt(ctx)
  const position: PromptInjectionPosition = ctx.position ?? promptInjectionDefaults.position

  const baseHistory = inject && !ctx.includeHistory && ctx.messageIndex > 1 ? [] : history

  const userMessage: ChatMessage = { role: 'user', content: userInput }

  if (!inject) {
    return [...baseHistory, userMessage]
  }

  switch (position) {
    case 'system': {
      const systemMsg: ChatMessage = { role: 'system', content: ctx.promptText }
      const withoutSystem = baseHistory.filter((m) => m.role !== 'system')
      return [systemMsg, ...withoutSystem, userMessage]
    }
    case 'user-prefix': {
      const prefixed: ChatMessage = {
        role: 'user',
        content: `${ctx.promptText}\n\n${userInput}`,
      }
      return [...baseHistory, prefixed]
    }
    case 'user-suffix': {
      const suffixed: ChatMessage = {
        role: 'user',
        content: `${userInput}\n\n${ctx.promptText}`,
      }
      return [...baseHistory, suffixed]
    }
  }
}

/**
 * Convenience: resolve injection context from raw settings values,
 * applying defaults for any missing field.
 */
export function resolveInjectionContext(
  partial: Partial<InjectionContext> & Pick<InjectionContext, 'messageIndex' | 'promptText'>
): InjectionContext {
  return {
    mode: partial.mode ?? promptInjectionDefaults.mode,
    position: partial.position ?? promptInjectionDefaults.position,
    interval: partial.interval ?? promptInjectionDefaults.interval,
    includeHistory: partial.includeHistory ?? promptInjectionDefaults.includeHistory,
    messageIndex: partial.messageIndex,
    promptChanged: partial.promptChanged ?? false,
    promptText: partial.promptText,
  }
}
