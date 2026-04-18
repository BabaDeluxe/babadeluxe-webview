import type { Message } from '@/database/types'

export type FormattedContextItem = { filePath: string; content: string }

export class ChatContextManager {
  static buildInjectedText(systemPrompt?: string, contextItems?: FormattedContextItem[]): string {
    systemPrompt = systemPrompt?.trim()
    const parts: string[] = []
    if (systemPrompt) {
      parts.push(`SYSTEM:\n${systemPrompt}`)
    }

    const cleanedItems = (contextItems ?? []).filter(
      (item) => item.filePath?.trim().length && item.content?.trim().length
    )

    if (cleanedItems.length) {
      const ctxParts: string[] = []
      for (const item of cleanedItems) {
        ctxParts.push(`FILE: ${item.filePath}\n${item.content}`)
      }
      const ctx = ctxParts.join('\n\n')
      parts.push(`CONTEXT:\n${ctx}`)
    }

    if (!parts.length) return ''
    return `\n\n---\n${parts.join('\n\n')}\n---\n`
  }

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  static computeContextUsage(
    historyMessages: Message[],
    systemPrompt: string | undefined,
    contextItems: FormattedContextItem[] | undefined,
    modelContextWindow: number
  ): number {
    if (!modelContextWindow || modelContextWindow <= 0) {
      return 0
    }

    const messagesToSend: Array<{ role: Message['role']; content: string }> = []
    for (const message of historyMessages) {
      messagesToSend.push({
        role: message.role,
        content: message.content,
      })
    }

    const injected = this.buildInjectedText(systemPrompt, contextItems ?? [])
    const last = messagesToSend[messagesToSend.length - 1]
    if (last && last.role === 'user' && injected) {
      last.content = `${last.content}${injected}`
    }

    const safeBudget = Math.max(1, Math.floor(modelContextWindow * 0.95))

    let totalTokens = 0
    for (const msg of messagesToSend) {
      totalTokens += this.estimateTokens(msg.content)
    }

    const usagePercent = totalTokens / safeBudget
    return usagePercent > 1 ? 1 : usagePercent
  }
}
