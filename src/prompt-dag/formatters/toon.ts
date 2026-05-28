import type { PromptFormatter } from '../formatter-interface.js'
import type { PromptDag } from '../prompt-dag.js'

export class ToonPromptFormatter implements PromptFormatter {
  generate(dag: PromptDag, caps: Set<string>): string {
    const nodes = dag.getAllNodes()
    if (nodes.length === 0) return ''

    const supportsParallel = caps.has('parallel_tool_calls')
    const lines: string[] = []

    lines.push('format_version: 1.0')
    lines.push(`parallel_supported: ${supportsParallel}`)
    lines.push('')

    if (supportsParallel) {
      const levels = dag.topologicalLevels()
      lines.push(`levels[${levels.length}]:`)
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i]
        lines.push(`  - level: ${i}`)
        lines.push(`    parallel: true`)
        if (i < levels.length - 1) lines.push(`    await_completion: true`)
        lines.push(`    tasks[${level.length}]{id,capabilities,content}:`)
        for (const task of level) {
          lines.push(`      ${task.taskId},${task.requiredCapabilities.join(';') || '-'},${this._toonValue(task.content)}`)
        }
      }
    } else {
      const sorted = dag.topologicalSort()
      lines.push(`tasks[${sorted.length}]{id,capabilities,content}:`)
      for (const task of sorted) {
        lines.push(`  ${task.taskId},${task.requiredCapabilities.join(';') || '-'},${this._toonValue(task.content)}`)
      }
    }
    return lines.join('\n')
  }

  private _toonValue(text: string): string {
    const needsQuoting = text.includes(',') || text.includes('\n') || text.includes('"')
    return needsQuoting ? `"${text.replace(/"/g, '\\"')}"` : text
  }
}
