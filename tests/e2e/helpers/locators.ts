import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { BaseError } from '@babadeluxe/shared'
import { logger } from '@/logger'

export const locators = {
  // Chat view
  chatView: Symbol('chatView'),
  chatInput: Symbol('chatInput'),
  chatSend: Symbol('chatSend'),
  chatAbort: Symbol('chatAbort'),
  message1: Symbol('message1'),
  messageMenu: Symbol('messageMenu'),
  menuCopy: Symbol('menuCopy'),
  menuEdit: Symbol('menuEdit'),
  menuDelete: Symbol('menuDelete'),
  messageTextarea: Symbol('messageTextarea'),
  messageSave: Symbol('messageSave'),
  messageCancel: Symbol('messageCancel'),

  // History view
  historyTab: Symbol('historyTab'),
  historyRoot: Symbol('historyRoot'),
  historySearchInput: Symbol('historySearchInput'),
  historySearchDropdown: Symbol('historySearchDropdown'),
  historyConversationsHeading: Symbol('historyConversationsHeading'),
  historyConversationsContainer: Symbol('historyConversationsContainer'),

  // Prompts view
  promptsRoot: Symbol('promptsRoot'),
  promptsNewButton: Symbol('promptsNewButton'),
  promptsItemFirst: Symbol('promptsItemFirst'),
  promptsNameInput: Symbol('promptsNameInput'),
  promptsCommandInput: Symbol('promptsCommandInput'),
  promptsDescriptionInput: Symbol('promptsDescriptionInput'),
  promptsTemplateInput: Symbol('promptsTemplateInput'),
  promptsSaveButton: Symbol('promptsSaveButton'),
  promptsDeleteButton: Symbol('promptsDeleteButton'),
  promptsDeleteDialog: Symbol('promptsDeleteDialog'),
} as const

export type LocatorKey = (typeof locators)[keyof typeof locators]

type LocatorStateExpectation = {
  isVisible?: boolean
  isAttached?: boolean
  isEnabled?: boolean
  isDisabled?: boolean
  timeoutMs?: number
}

export class UndefinedLocatorError extends BaseError {
  constructor(locatorKey: LocatorKey, cause?: unknown, ns?: string) {
    super(`Didn't find locator "${String(locatorKey.description ?? locatorKey)}"`, cause, ns)
    this.name = 'UndefinedLocatorError'
  }
}

export class LocatorDealer {
  private readonly _scoped = new Map<LocatorKey, Locator>()
  private readonly _global = new Map<LocatorKey, Locator>()
  private readonly _expectations = new Map<LocatorKey, LocatorStateExpectation>()

  constructor(
    private readonly _page: Page,
    expectations?: Partial<Record<LocatorKey, LocatorStateExpectation>>
  ) {
    if (expectations) {
      for (const key of Object.getOwnPropertySymbols(expectations) as LocatorKey[]) {
        const value = expectations[key]
        if (value) this._expectations.set(key, value)
      }
    }
  }

  init(): void {
    /* ---- Chat view ---- */
    const chatView = this._page.getByTestId('chat-view-container')
    this._scoped.set(locators.chatView, chatView)

    this._scoped.set(
      locators.chatInput,
      this._page
        .getByTestId('chat-message-input-top')
        .or(this._page.getByTestId('chat-message-input-bottom'))
    )
    this._scoped.set(
      locators.chatSend,
      this._page
        .getByTestId('chat-send-button-top')
        .or(this._page.getByTestId('chat-send-button-bottom'))
    )
    this._scoped.set(
      locators.chatAbort,
      this._page
        .getByTestId('chat-abort-button-top')
        .or(this._page.getByTestId('chat-abort-button-bottom'))
    )

    const msg1 = this._page.getByTestId('message-1')
    this._scoped.set(locators.message1, msg1)
    this._scoped.set(locators.messageMenu, msg1.getByTestId('message-menu-button'))

    this._global.set(locators.menuCopy, this._page.getByTestId('message-copy-button'))
    this._global.set(locators.menuEdit, this._page.getByTestId('message-edit-button'))
    this._global.set(locators.menuDelete, this._page.getByTestId('message-delete-button'))

    this._global.set(locators.messageTextarea, this._page.getByTestId('editable-textarea'))
    this._global.set(locators.messageSave, this._page.getByTestId('editable-save-button'))
    this._global.set(locators.messageCancel, this._page.getByTestId('editable-cancel-button'))

    /* ---- History view ---- */
    this._scoped.set(locators.historyTab, this._page.getByTestId('nav-history-link'))

    this._scoped.set(locators.historyRoot, this._page.getByTestId('history-view-container'))

    const historySearchInput = this._page.getByTestId('history-search-input')
    this._scoped.set(locators.historySearchInput, historySearchInput)

    this._scoped.set(
      locators.historySearchDropdown,
      this._page.getByTestId('history-search-dropdown')
    )

    const conversationsHeading = this._page.getByRole('heading', { name: /^conversations$/i })
    this._scoped.set(locators.historyConversationsHeading, conversationsHeading)
    this._scoped.set(locators.historyConversationsContainer, conversationsHeading.locator('..'))

    /* ---- Prompts view ---- */
    const promptsRoot = this._page.getByTestId('prompts-view-container')
    this._scoped.set(locators.promptsRoot, promptsRoot)

    this._scoped.set(
      locators.promptsNewButton,
      promptsRoot.getByRole('button', { name: /new prompt/i })
    )
    this._scoped.set(locators.promptsItemFirst, promptsRoot.getByTestId('prompt-item').first())

    const editor = promptsRoot.getByTestId('prompt-editor').filter({ visible: true })
    this._scoped.set(locators.promptsNameInput, editor.getByTestId('prompt-name-input'))
    this._scoped.set(locators.promptsCommandInput, editor.getByTestId('prompt-command-input'))
    this._scoped.set(
      locators.promptsDescriptionInput,
      editor.getByTestId('prompt-description-input')
    )
    this._scoped.set(locators.promptsTemplateInput, editor.getByTestId('prompt-template-input'))
    this._scoped.set(locators.promptsSaveButton, editor.getByTestId('prompt-save-button'))
    this._scoped.set(
      locators.promptsDeleteButton,
      promptsRoot.getByTestId('prompt-item').first().getByTestId('prompt-delete-button')
    )
    this._scoped.set(locators.promptsDeleteDialog, promptsRoot.locator('[role="dialog"]'))
  }

  private _require(map: Map<LocatorKey, Locator>, key: LocatorKey): Locator {
    const locator = map.get(key)
    if (!locator) {
      logger.warn('Locator key not found', { key: String(key.description ?? key) })
      throw new UndefinedLocatorError(key)
    }
    return locator
  }

  private async _applyExpectations(
    locator: Locator,
    key: LocatorKey,
    override?: LocatorStateExpectation
  ): Promise<void> {
    const base = this._expectations.get(key)
    const exp: LocatorStateExpectation | undefined =
      base || override ? { ...(base ?? {}), ...(override ?? {}) } : undefined

    if (!exp) return

    const timeout = exp.timeoutMs ?? 10_000

    if (exp.isAttached) await locator.waitFor({ state: 'attached', timeout })
    if (exp.isVisible) await locator.waitFor({ state: 'visible', timeout })
    if (exp.isEnabled) await expect(locator).toBeEnabled({ timeout })
    if (exp.isDisabled) await expect(locator).toBeDisabled({ timeout })
  }

  async get(key: LocatorKey, override?: LocatorStateExpectation): Promise<Locator> {
    let locator = this._require(this._scoped, key)
    if (!locator) locator = this._require(this._global, key)
    await this._applyExpectations(locator, key, override)
    return locator
  }
}

export const createLocatorDealer = (
  page: Page,
  expectations?: Partial<Record<LocatorKey, LocatorStateExpectation>>
): LocatorDealer => {
  const dealer = new LocatorDealer(page, expectations)
  dealer.init()
  return dealer
}
