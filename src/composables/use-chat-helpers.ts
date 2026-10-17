import { computed, watch, type Ref } from 'vue'

export function useChatGitMessageWatcher(
  gitMessage: {
    pendingCommitContext: Ref<{ diff: string } | null>
    pendingPrContext: Ref<{
      headBranch: string
      baseBranch: string
      commitMessages: string[]
      diff: string
    } | null>
  },
  currentMessage: Ref<string>
) {
  watch(
    () => gitMessage.pendingCommitContext.value,
    (context) => {
      if (!context) return
      currentMessage.value = `Generate a commit message for this diff:\n\n${context.diff}`
      gitMessage.pendingCommitContext.value = null
    }
  )

  watch(
    () => gitMessage.pendingPrContext.value,
    (context) => {
      if (!context) return
      currentMessage.value = `Generate a PR title and description for merging ${context.headBranch} into ${context.baseBranch}.\n\nCommits:\n${context.commitMessages.join(
        '\n'
      )}\n\nDiff:\n${context.diff}`
      gitMessage.pendingPrContext.value = null
    }
  )
}

export function useChatContextUsageWarning(lastContextUsage: Ref<number>) {
  return computed(() => {
    const usage = lastContextUsage.value
    if (usage >= 0.8) {
      return 'This conversation is close to the model\u2019s context limit. Older messages will be truncated.'
    }
    if (usage >= 0.6) {
      return 'This conversation is getting long; earlier messages may be dropped soon.'
    }
    return ''
  })
}
