import type { PromptFormatter } from '../types.js'
import type { PromptDag } from '../prompt-dag.js'

export class XmlPromptFormatter implements PromptFormatter {
  generate(dag: PromptDag, caps: Set<string>): string {
    const nodes = dag.getAllNodes()
    if (nodes.length === 0) return ''

    const lines: string[] = []
    const supportsParallel = caps.has('parallel_tool_calls')

    if (supportsParallel) {
      const levels = dag.topologicalLevels()
      lines.push('<execution_plan>')
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i]
        lines.push(`<parallel level="${i}">`)
        for (const task of level) {
          lines.push(`  <task id="${task.taskId}" capabilities="${task.requiredCapabilities.join(',')}">`) 
          lines.push(`    ${this.escapeXml(task.content)}`)
          lines.push(`  </task>`)
        }
        lines.push(`</parallel>`)
        if (i < levels.length - 1) lines.push(`<await_completion level="${i}"/>`)
      }
      lines.push('</execution_plan>')
    } else {
      const sorted = dag.topologicalSort()
      lines.push('<sequential>')
      for (const task of sorted) {
        lines.push(`<task id="${task.taskId}" capabilities="${task.requiredCapabilities.join(',')}">`) 
        lines.push(`  ${this.escapeXml(task.content)}`)
        lines.push(`</task>`)
      }
      lines.push('</sequential>')
    }
    return lines.join('\n')
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}
