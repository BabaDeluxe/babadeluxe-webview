export const lottieBaseSpinnerUrl =
  'https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie'

export const defaultModel = 'gemini:gemini-2.5-flash'

export const streamingCommitIntervalMs = 2_000

export const socketTimeoutMs = {
  emit: Number(15_000),
  models: Number(15_000),
  prompts: Number(15_000),
  settings: Number(5_000),
  validation: Number(5_000),
  subscription: Number(10_000),
  vsCodeContext: Number(30_000),
  vsCodeFileResolve: Number(60_000),
  vsCodeAuthLogin: Number(120_000),
  vsCodeAuthSession: Number(1_500),
  chatSend: Number(60_000),
  chatAbort: Number(5_000),
  init: Number(15_000),
} as const

export const localStorageKeys = {
  currentConversationId: 'current-conversation-id',
} as const

export const templateLimits = {
  maxPromptLength: Number(20_000),
  warningThreshold: Number(19_000),
} as const
