import type { PromptFormatter } from '../types.js'
import type { PromptDag } from '../prompt-dag.js'

export class JsonPromptFormatter implements PromptFormatter {
  generate(dag: PromptDag, caps: Set<string>): string {
    const nodes = dag.getAllNodes()
    if (nodes.length === 0) return '{}'

    const supportsParallel = caps.has('parallel_tool_calls')
    const plan: Record<string, unknown> = {
      format_version: '1.0',
      parallel_supported: supportsParallel,
    }

    if (supportsParallel) {
      plan.execution_levels = dag.topologicalLevels().map((level, i) => ({
        level: i,
        parallel: true,
        tasks: level.map(t => ({
          id: t.taskId,
          capabilities: t.requiredCapabilities,
          content: t.content,
        })),
      }))
    } else {
      plan.tasks = dag.topologicalSort().map(t => ({
        id: t.taskId,
        capabilities: t.requiredCapabilities,
        content: t.content,
      }))
    }
    return JSON.stringify(plan, null, 2)
  }
}
