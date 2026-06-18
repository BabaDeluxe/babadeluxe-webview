import type { PromptFormatter } from '../formatter-interface.js'
import type { PromptDag } from '../prompt-dag.js'

export class MarkdownPromptFormatter implements PromptFormatter {
  generate(dag: PromptDag, caps: Set<string>): string {
    const nodes = dag.getAllNodes()
    if (nodes.length === 0) return ''

    const lines: string[] = ['# Execution Plan', '']
    const supportsParallel = caps.has('parallel_tool_calls')

    if (supportsParallel) {
      const levels = dag.topologicalLevels()
      lines.push('Parallel execution supported. Levels:')
      for (let i = 0; i < levels.length; i++) {
        lines.push(`- **Level ${i}** (parallel)`)
        for (const task of levels[i]) {
          lines.push(`  - Task \`${task.taskId}\` (capabilities: ${task.requiredCapabilities.join(', ') || 'none'})`)
          lines.push(`    > ${task.content}`)
        }
        if (i < levels.length - 1) lines.push(`  ⏳ *Wait for level ${i} to complete*`)
      }
    } else {
      const sorted = dag.topologicalSort()
      lines.push('Sequential execution:')
      for (const task of sorted) {
        lines.push(`1. **${task.taskId}** (capabilities: ${task.requiredCapabilities.join(', ') || 'none'})`)
        lines.push(`   > ${task.content}`)
      }
    }
    return lines.join('\n')
  }
}
