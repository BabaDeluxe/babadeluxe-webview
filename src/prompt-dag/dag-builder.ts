import { ok, err, type Result } from 'neverthrow'
import type { PromptFormatter } from './types.js'
import { PromptRegistry } from './prompt-registry.js'
import { PresetRegistry } from './preset-registry.js'
import { PromptDag } from './prompt-dag.js'
import { XmlPromptFormatter } from './formatters/xml.js'

export class DagBuilder {
  private static defaultFormatter: PromptFormatter = new XmlPromptFormatter()
  private dag = new PromptDag()
  private registry: PromptRegistry
  private presetRegistry: PresetRegistry | null = null
  private enabledPresets: Set<string> = new Set()
  private taskCounter = 0

  constructor(registry: PromptRegistry, presetRegistry?: PresetRegistry) {
    this.registry = registry
    if (presetRegistry) {
      this.presetRegistry = presetRegistry
      this.useDefaultPresets()
    }
  }

  private useDefaultPresets(): void {
    if (!this.presetRegistry) return
    for (const preset of this.presetRegistry.getAll()) {
      if (preset.defaultEnabled !== false) this.enabledPresets.add(preset.presetId)
    }
  }

  enablePreset(presetId: string): this {
    this.enabledPresets.add(presetId)
    return this
  }

  disablePreset(presetId: string): this {
    this.enabledPresets.delete(presetId)
    return this
  }

  addTask(partId: string): Result<string, Error> {
    const partResult = this.registry.get(partId)
    if (partResult.isErr()) return err(partResult.error)

    const taskId = `task_${this.taskCounter++}`
    const node = {
      taskId,
      partId,
      content: partResult.value.content,
      requiredCapabilities: partResult.value.requiredCapabilities ?? [],
      dependsOn: [] as string[],
    }
    this.dag.addNode(node)
    return ok(taskId)
  }

  dependsOn(fromTaskId: string, toTaskId: string): Result<this, Error> {
    const fromNode = this.dag.getNode(fromTaskId)
    if (!fromNode) return err(new Error(`Task "${fromTaskId}" not found`))
    const toNode = this.dag.getNode(toTaskId)
    if (!toNode) return err(new Error(`Task "${toTaskId}" not found`))
    toNode.dependsOn.push(fromTaskId)
    return ok(this)
  }

  chain(partIds: string[]): Result<string[], Error> {
    const ids: string[] = []
    for (const partId of partIds) {
      const taskResult = this.addTask(partId)
      if (taskResult.isErr()) return err(taskResult.error)
      ids.push(taskResult.value)
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const depResult = this.dependsOn(ids[i], ids[i + 1])
      if (depResult.isErr()) return err(depResult.error)
    }
    return ok(ids)
  }

  parallel(partIds: string[]): Result<string[], Error> {
    const ids: string[] = []
    for (const partId of partIds) {
      const taskResult = this.addTask(partId)
      if (taskResult.isErr()) return err(taskResult.error)
      ids.push(taskResult.value)
    }
    return ok(ids)
  }

  addPreset(presetId: string, overrides?: { repeat?: number; enabled?: boolean }): Result<string[], Error> {
    if (!this.presetRegistry) return err(new Error('No preset registry configured'))

    const presetResult = this.presetRegistry.get(presetId)
    if (presetResult.isErr()) return err(presetResult.error)

    const preset = presetResult.value
    const isEnabled = overrides?.enabled ?? this.enabledPresets.has(presetId)
    if (!isEnabled) return ok([])

    const repeat = overrides?.repeat ?? preset.repeat ?? 1
    if (repeat < 1) return ok([])

    if (repeat === 1) {
      const taskResult = this.addTask(preset.id)
      if (taskResult.isErr()) return err(taskResult.error)
      return ok([taskResult.value])
    }

    const ids: string[] = []
    for (let i = 0; i < repeat; i++) {
      const taskResult = this.addTask(preset.id)
      if (taskResult.isErr()) return err(taskResult.error)
      ids.push(taskResult.value)
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const depResult = this.dependsOn(ids[i], ids[i + 1])
      if (depResult.isErr()) return err(depResult.error)
    }
    return ok(ids)
  }

  build(systemCapabilities: Set<string>, format?: PromptFormatter): string {
    const filteredDag = this.filterByCapabilities(systemCapabilities)
    const formatter = format ?? DagBuilder.defaultFormatter
    return formatter.generate(filteredDag, systemCapabilities)
  }

  private filterByCapabilities(caps: Set<string>): PromptDag {
    const newDag = new PromptDag()
    const allNodes = this.dag.getAllNodes()
    const keptIds = new Set<string>()

    for (const node of allNodes) {
      const allMet = node.requiredCapabilities.every(c => caps.has(c))
      if (allMet) {
        newDag.addNode({ ...node, dependsOn: [...node.dependsOn] })
        keptIds.add(node.taskId)
      }
    }

    for (const node of newDag.getAllNodes())
      node.dependsOn = node.dependsOn.filter(depId => keptIds.has(depId))

    newDag.removeOrphans()
    return newDag
  }
}
