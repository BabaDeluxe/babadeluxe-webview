export const lottieBaseSpinnerUrl =
  'https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie'

export const defaultModel = 'gemini:gemini-2.5-flash'

export const streamingCommitIntervalMs = 2_000

export const socketTimeoutMs = {
  emit: 15_000,
  models: 15_000,
  prompts: 15_000,
  settings: 5_000,
  validation: 5_000,
  subscription: 10_000,
  vsCodeContext: 30_000,
  vsCodeFileResolve: 60_000,
  vsCodeAuthLogin: 120_000,
  vsCodeAuthSession: 1_500,
  chatSend: 60_000,
  chatAbort: 5_000,
  init: 15_000,
} as const

export const localStorageKeys = {
  currentConversationId: 'current-conversation-id',
} as const

export const templateLimits = {
  maxPromptLength: 20_000,
  warningThreshold: 19_000,
} as const
