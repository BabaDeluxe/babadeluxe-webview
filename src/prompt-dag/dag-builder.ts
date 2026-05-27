import { ok, err, type Result } from 'neverthrow'
import type { PromptFormatter } from './formatter-interface.js'
import { PromptRegistry } from './prompt-registry.js'
import { PresetRegistry } from './preset-registry.js'
import { PromptDag } from './prompt-dag.js'
import { XmlPromptFormatter } from './formatters/xml.js'
import { logger } from '../logger.js'

export class DagBuilder {
  /**
   * Instance-level default formatter. Assign per-instance to avoid the
   * static shared-state footgun. Falls back to XmlPromptFormatter.
   */
  private defaultFormatter: PromptFormatter = new XmlPromptFormatter()
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

  setDefaultFormatter(formatter: PromptFormatter): this {
    this.defaultFormatter = formatter
    return this
  }

  addTask(partId: string): Result<string, Error> {
    const partResult = this.registry.get(partId)
    if (partResult.isErr()) return err(partResult.error)

    const taskId = `task_${this.taskCounter++}`
    this.dag.addNode({
      taskId,
      partId,
      content: partResult.value.content,
      requiredCapabilities: partResult.value.requiredCapabilities ?? [],
      dependsOn: [],
    })
    return ok(taskId)
  }

  /**
   * Mark `dependant` as depending on `independent`.
   * i.e. `independent` must complete before `dependant` starts.
   */
  addDependency(independent: string, dependant: string): Result<this, Error> {
    if (!this.dag.getNode(independent))
      return err(new Error(`Task "${independent}" not found`))
    const dependantNode = this.dag.getNode(dependant)
    if (!dependantNode)
      return err(new Error(`Task "${dependant}" not found`))
    dependantNode.dependsOn.push(independent)
    return ok(this)
  }

  chain(partIds: string[]): Result<string[], Error> {
    const ids: string[] = []
    for (const partId of partIds) {
      const r = this.addTask(partId)
      if (r.isErr()) return err(r.error)
      ids.push(r.value)
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const r = this.addDependency(ids[i], ids[i + 1])
      if (r.isErr()) return err(r.error)
    }
    return ok(ids)
  }

  parallel(partIds: string[]): Result<string[], Error> {
    const ids: string[] = []
    for (const partId of partIds) {
      const r = this.addTask(partId)
      if (r.isErr()) return err(r.error)
      ids.push(r.value)
    }
    return ok(ids)
  }

  addPreset(
    presetId: string,
    overrides?: { repeat?: number; enabled?: boolean },
  ): Result<string[], Error> {
    if (!this.presetRegistry)
      return err(new Error('No preset registry configured'))

    const presetResult = this.presetRegistry.get(presetId)
    if (presetResult.isErr()) return err(presetResult.error)

    const preset = presetResult.value
    const isEnabled = overrides?.enabled ?? this.enabledPresets.has(presetId)
    if (!isEnabled) return ok([])

    const repeat = overrides?.repeat ?? preset.repeat ?? 1
    if (repeat < 1) return ok([])

    const ids: string[] = []
    for (let i = 0; i < repeat; i++) {
      const r = this.addTask(preset.id)
      if (r.isErr()) return err(r.error)
      ids.push(r.value)
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const r = this.addDependency(ids[i], ids[i + 1])
      if (r.isErr()) return err(r.error)
    }
    return ok(ids)
  }

  build(systemCapabilities: Set<string>, format?: PromptFormatter): string {
    const cycleResult = this.dag.detectCycle()
    if (cycleResult.isErr()) {
      logger.error('DagBuilder.build() aborted:', cycleResult.error)
      return ''
    }
    const filteredDag = this.filterByCapabilities(systemCapabilities)
    return (format ?? this.defaultFormatter).generate(filteredDag, systemCapabilities)
  }

  private filterByCapabilities(caps: Set<string>): PromptDag {
    const newDag = new PromptDag()
    const keptIds = new Set<string>()

    for (const node of this.dag.getAllNodes()) {
      if (node.requiredCapabilities.every(c => caps.has(c))) {
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
