import { describe, it, expect, beforeEach } from 'vitest'
import { PromptRegistry } from './prompt-registry.js'
import { PresetRegistry } from './preset-registry.js'
import { PromptDag } from './prompt-dag.js'
import { DagBuilder } from './dag-builder.js'
import { XmlPromptFormatter } from './formatters/xml.js'
import { JsonPromptFormatter } from './formatters/json.js'
import { MarkdownPromptFormatter } from './formatters/markdown.js'
import { ToonPromptFormatter } from './formatters/toon.js'
import { DEFAULT_PROMPT_PARTS } from './default-parts.js'
import { DEFAULT_PRESETS } from './default-presets.js'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PARTS = [
  { id: 'think',    content: 'Think step by step.' },
  { id: 'summarize', content: 'Summarise in 3 bullets.' },
  { id: 'critique', content: 'Critique the answer.' },
  { id: 'web',      content: 'Search the web.', requiredCapabilities: ['web_search'] },
  { id: 'file',     content: 'Use file tools.',  requiredCapabilities: ['file_system'] },
]

function makeRegistry(): PromptRegistry {
  const r = new PromptRegistry()
  r.load(PARTS)
  return r
}

function makeBuilder(withPresets = false): DagBuilder {
  const registry = makeRegistry()
  if (withPresets) {
    const presetRegistry = new PresetRegistry()
    presetRegistry.load(DEFAULT_PRESETS)
    return new DagBuilder(registry, presetRegistry)
  }
  return new DagBuilder(registry)
}

// ─── PromptRegistry ──────────────────────────────────────────────────────────

describe('PromptRegistry', () => {
  it('returns ok for existing part', () => {
    const r = makeRegistry()
    const result = r.get('think')
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().content).toBe('Think step by step.')
  })

  it('returns err for missing part', () => {
    const r = makeRegistry()
    const result = r.get('nonexistent')
    expect(result.isErr()).toBe(true)
  })

  it('has() reflects registration state', () => {
    const r = makeRegistry()
    expect(r.has('think')).toBe(true)
    expect(r.has('nope')).toBe(false)
  })
})

// ─── PromptDag ───────────────────────────────────────────────────────────────

describe('PromptDag', () => {
  it('topologicalSort returns empty for empty dag', () => {
    const dag = new PromptDag()
    expect(dag.topologicalSort()).toEqual([])
  })

  it('topologicalSort respects dependsOn order', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 'a', partId: 'think',    content: '', requiredCapabilities: [], dependsOn: [] })
    dag.addNode({ taskId: 'b', partId: 'summarize', content: '', requiredCapabilities: [], dependsOn: ['a'] })
    dag.addNode({ taskId: 'c', partId: 'critique',  content: '', requiredCapabilities: [], dependsOn: ['b'] })

    const sorted = dag.topologicalSort().map(n => n.taskId)
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'))
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'))
  })

  it('topologicalLevels groups parallel tasks', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 'a', partId: 'think',    content: '', requiredCapabilities: [], dependsOn: [] })
    dag.addNode({ taskId: 'b', partId: 'summarize', content: '', requiredCapabilities: [], dependsOn: [] })
    dag.addNode({ taskId: 'c', partId: 'critique',  content: '', requiredCapabilities: [], dependsOn: ['a', 'b'] })

    const levels = dag.topologicalLevels()
    expect(levels).toHaveLength(2)
    expect(levels[0].map(n => n.taskId).sort()).toEqual(['a', 'b'])
    expect(levels[1].map(n => n.taskId)).toEqual(['c'])
  })

  it('removeOrphans prunes unreachable nodes', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 'root',   partId: 'think',    content: '', requiredCapabilities: [], dependsOn: [] })
    dag.addNode({ taskId: 'child',  partId: 'summarize', content: '', requiredCapabilities: [], dependsOn: ['root'] })
    dag.addNode({ taskId: 'orphan', partId: 'critique',  content: '', requiredCapabilities: [], dependsOn: ['missing'] })

    dag.removeOrphans()
    const ids = dag.getAllNodes().map(n => n.taskId)
    expect(ids).toContain('root')
    expect(ids).toContain('child')
    expect(ids).not.toContain('orphan')
  })
})

// ─── DagBuilder ──────────────────────────────────────────────────────────────

describe('DagBuilder', () => {
  it('addTask returns ok for known part', () => {
    const builder = makeBuilder()
    const result = builder.addTask('think')
    expect(result.isOk()).toBe(true)
  })

  it('addTask returns err for unknown part', () => {
    const builder = makeBuilder()
    const result = builder.addTask('unknown')
    expect(result.isErr()).toBe(true)
  })

  it('chain wires tasks sequentially', () => {
    const builder = makeBuilder()
    const result = builder.chain(['think', 'summarize', 'critique'])
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toHaveLength(3)
  })

  it('parallel adds tasks with no dependencies between them', () => {
    const builder = makeBuilder()
    const result = builder.parallel(['think', 'summarize'])
    expect(result.isOk()).toBe(true)
    const ids = result._unsafeUnwrap()
    expect(ids).toHaveLength(2)
  })

  it('build filters out tasks whose capabilities are not met', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    builder.addTask('web')
    const output = builder.build(new Set<string>())
    expect(output).not.toContain('Search the web')
    expect(output).toContain('Think step by step')
  })

  it('build includes capability-gated task when cap is present', () => {
    const builder = makeBuilder()
    builder.addTask('web')
    const output = builder.build(new Set(['web_search']))
    expect(output).toContain('Search the web')
  })

  it('build returns empty string when all tasks are filtered', () => {
    const builder = makeBuilder()
    builder.addTask('web')
    const output = builder.build(new Set<string>())
    expect(output).toBe('')
  })
})

// ─── Formatters ──────────────────────────────────────────────────────────────

describe('XmlPromptFormatter', () => {
  it('returns empty string for empty dag', () => {
    const dag = new PromptDag()
    const formatter = new XmlPromptFormatter()
    expect(formatter.generate(dag, new Set())).toBe('')
  })

  it('wraps sequential output in <sequential>', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const output = builder.build(new Set(), new XmlPromptFormatter())
    expect(output).toContain('<sequential>')
    expect(output).toContain('</sequential>')
  })

  it('wraps parallel output in <execution_plan>', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const output = builder.build(new Set(['parallel_tool_calls']), new XmlPromptFormatter())
    expect(output).toContain('<execution_plan>')
  })
})

describe('JsonPromptFormatter', () => {
  it('returns {} for empty dag', () => {
    const dag = new PromptDag()
    expect(new JsonPromptFormatter().generate(dag, new Set())).toBe('{}')
  })

  it('produces valid JSON with tasks array', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const output = builder.build(new Set(), new JsonPromptFormatter())
    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed.tasks)).toBe(true)
    expect(parsed.tasks[0].content).toBe('Think step by step.')
  })

  it('produces execution_levels when parallel_tool_calls present', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const output = builder.build(new Set(['parallel_tool_calls']), new JsonPromptFormatter())
    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed.execution_levels)).toBe(true)
  })
})

describe('MarkdownPromptFormatter', () => {
  it('returns empty string for empty dag', () => {
    const dag = new PromptDag()
    expect(new MarkdownPromptFormatter().generate(dag, new Set())).toBe('')
  })

  it('includes # Execution Plan heading', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const output = builder.build(new Set(), new MarkdownPromptFormatter())
    expect(output).toContain('# Execution Plan')
  })
})

describe('ToonPromptFormatter', () => {
  it('returns empty string for empty dag', () => {
    const dag = new PromptDag()
    expect(new ToonPromptFormatter().generate(dag, new Set())).toBe('')
  })

  it('includes format_version header', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const output = builder.build(new Set(), new ToonPromptFormatter())
    expect(output).toContain('format_version: 1.0')
  })
})

// ─── Default parts & presets ─────────────────────────────────────────────────

describe('DEFAULT_PROMPT_PARTS', () => {
  it('all ids are unique', () => {
    const ids = DEFAULT_PROMPT_PARTS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all parts have non-empty content', () => {
    for (const part of DEFAULT_PROMPT_PARTS) {
      expect(part.content.length).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_PRESETS', () => {
  it('all presetIds are unique', () => {
    const ids = DEFAULT_PRESETS.map(p => p.presetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset.id references a known DEFAULT_PROMPT_PARTS id', () => {
    const partIds = new Set(DEFAULT_PROMPT_PARTS.map(p => p.id))
    for (const preset of DEFAULT_PRESETS) {
      expect(partIds.has(preset.id), `preset "${preset.presetId}" references unknown part "${preset.id}"`).toBe(true)
    }
  })
})
