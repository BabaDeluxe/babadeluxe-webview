import { ref } from 'vue'
import { VsCodeBridge } from '@/services/vs-code-bridge'
import type { GitCommitMessageContext, GitPrMessageContext } from '@/vs-code/types'

export function useGitMessage() {
  const vsCodeBridge = VsCodeBridge.getInstance()
  const pendingCommitContext = ref<GitCommitMessageContext | null>(null)
  const pendingPrContext = ref<GitPrMessageContext | null>(null)

  function handleCommitMessageContext(msg: GitCommitMessageContext) {
    pendingCommitContext.value = msg
  }

  function handlePrMessageContext(msg: GitPrMessageContext) {
    pendingPrContext.value = msg
  }

  function sendCommitResult(message: string) {
    vsCodeBridge.post({ type: 'git:commitMessageResult', message })
    pendingCommitContext.value = null
  }

  function sendPrResult(title: string, body: string) {
    vsCodeBridge.post({ type: 'git:prMessageResult', title, body })
    pendingPrContext.value = null
  }

  function clearPendingContext() {
    pendingCommitContext.value = null
    pendingPrContext.value = null
  }

  return {
    pendingCommitContext,
    pendingPrContext,
    handleCommitMessageContext,
    handlePrMessageContext,
    sendCommitResult,
    sendPrResult,
    clearPendingContext,
  }
}

export type GitMessageComposable = ReturnType<typeof useGitMessage>
