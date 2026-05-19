/**
 * Prompt Injection Service
 *
 * Pure, side-effect-free utility that resolves how and when the active system
 * prompt should be appended to the outgoing message array, based on user
 * settings from `@babadeluxe/shared`.
 *
 * Keeping this as a standalone module (not inside a store) means it is:
 *   - Trivially unit-testable without mounting Vue
 *   - Reusable in both the webview and any future VS Code extension context
 *
 * @module prompt-injection-service
 */

import type { PromptInjectionMode, PromptInjectionPosition } from '@babadeluxe/shared'
import { promptInjectionDefaults } from '@babadeluxe/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PromptInjectionOptions {
  /** The full text of the active system prompt. Empty string = no prompt. */
  systemPrompt: string
  /** Current injection mode (falls back to default if undefined). */
  mode: PromptInjectionMode
  /** Current injection position (falls back to default if undefined). */
  position: PromptInjectionPosition
  /** Interval for `every-x-messages` mode. */
  interval?: number
  /** Whether this is the very first user message of the conversation. */
  isFirstMessage: boolean
  /** Whether the active prompt changed since the last injection. */
  promptChanged: boolean
  /** Total number of user messages sent so far (before this one). */
  userMessageCount: number
  /** Whether prior history should be re-included on mid-conversation re-inject. */
  includeHistory?: boolean
}

export interface InjectionResult {
  /** Final message array to send to the LLM. */
  messages: ChatMessage[]
  /** True if the prompt was actually injected in this call. */
  injected: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldInject(opts: PromptInjectionOptions): boolean {
  if (!opts.systemPrompt) return false

  const mode = opts.mode ?? promptInjectionDefaults.mode

  switch (mode) {
    case 'always':
      return true

    case 'first-message':
      return opts.isFirstMessage

    case 'every-x-messages': {
      const n = opts.interval ?? promptInjectionDefaults.interval
      // Inject on the first message and then every n messages after that.
      return opts.userMessageCount % n === 0
    }

    case 'on-prompt-change':
      return opts.promptChanged

    case 'manual':
      return false

    default:
      return false
  }
}

function buildSystemMessage(prompt: string): ChatMessage {
  return { role: 'system', content: prompt }
}

function injectIntoMessages(
  messages: ChatMessage[],
  prompt: string,
  position: PromptInjectionPosition
): ChatMessage[] {
  switch (position) {
    case 'system':
      // Prepend a dedicated system message; replace any existing one to avoid
      // duplicate system turns.
      return [buildSystemMessage(prompt), ...messages.filter((m) => m.role !== 'system')]

    case 'user-prefix': {
      // Prepend the prompt text to the content of the first user message.
      const idx = messages.findIndex((m) => m.role === 'user')
      if (idx === -1) return [buildSystemMessage(prompt), ...messages]
      return messages.map((m, i) =>
        i === idx ? { ...m, content: `${prompt}\n\n${m.content}` } : m
      )
    }

    case 'user-suffix': {
      // Append the prompt text to the content of the last user message.
      const lastIdx = messages.reduceRight(
        (found, m, i) => (found === -1 && m.role === 'user' ? i : found),
        -1
      )
      if (lastIdx === -1) return [...messages, buildSystemMessage(prompt)]
      return messages.map((m, i) =>
        i === lastIdx ? { ...m, content: `${m.content}\n\n${prompt}` } : m
      )
    }

    default:
      return [buildSystemMessage(prompt), ...messages]
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the final message array to send to the LLM, applying the active
 * prompt injection strategy.
 *
 * @example
 * const { messages, injected } = buildMessagesWithPrompt(
 *   conversationHistory,
 *   {
 *     systemPrompt: 'You are a helpful assistant.',
 *     mode: 'every-x-messages',
 *     position: 'system',
 *     interval: 5,
 *     isFirstMessage: false,
 *     promptChanged: false,
 *     userMessageCount: 10,
 *   }
 * )
 */
export function buildMessagesWithPrompt(
  messages: ChatMessage[],
  opts: PromptInjectionOptions
): InjectionResult {
  const inject = shouldInject(opts)

  if (!inject) {
    return { messages, injected: false }
  }

  const position = opts.position ?? promptInjectionDefaults.position
  const injected = injectIntoMessages(messages, opts.systemPrompt, position)

  return { messages: injected, injected: true }
}

/**
 * Manually trigger a prompt injection regardless of the current mode.
 * Used by the "Inject Prompt" button in the chat UI when mode is `manual`.
 */
export function forceInjectPrompt(
  messages: ChatMessage[],
  systemPrompt: string,
  position: PromptInjectionPosition = promptInjectionDefaults.position
): ChatMessage[] {
  if (!systemPrompt) return messages
  return injectIntoMessages(messages, systemPrompt, position)
}
