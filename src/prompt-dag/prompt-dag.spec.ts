import { describe, it, expect } from 'vitest'
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
  { id: 'think',     content: 'Think step by step.' },
  { id: 'summarize', content: 'Summarise in 3 bullets.' },
  { id: 'critique',  content: 'Critique the answer.' },
  { id: 'web',       content: 'Search the web.',  requiredCapabilities: ['web_search'] },
  { id: 'file',      content: 'Use file tools.', requiredCapabilities: ['file_system'] },
]

const PRESETS = [
  { presetId: 'p_think',    id: 'think',    defaultEnabled: true,  repeat: 1 },
  { presetId: 'p_summarize',id: 'summarize',defaultEnabled: false, repeat: 1 },
  { presetId: 'p_critique', id: 'critique', defaultEnabled: false, repeat: 2 },
  { presetId: 'p_web',      id: 'web',      defaultEnabled: true,  repeat: 1 },
]

function makeRegistry(): PromptRegistry {
  const r = new PromptRegistry()
  r.load(PARTS)
  return r
}

function makeBuilder(): DagBuilder {
  return new DagBuilder(makeRegistry())
}

function makeBuilderWithPresets(): DagBuilder {
  const pr = new PresetRegistry()
  pr.load(PRESETS)
  return new DagBuilder(makeRegistry(), pr)
}

// ─── PromptRegistry ──────────────────────────────────────────────────────────

describe('PromptRegistry', () => {
  it('returns ok for existing part', () => {
    const r = makeRegistry()
    expect(r.get('think').isOk()).toBe(true)
    expect(r.get('think')._unsafeUnwrap().content).toBe('Think step by step.')
  })

  it('returns err for missing part', () => {
    expect(makeRegistry().get('nonexistent').isErr()).toBe(true)
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
    expect(new PromptDag().topologicalSort()).toEqual([])
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
    dag.addNode({ taskId: 'a', partId: 'think',     content: '', requiredCapabilities: [], dependsOn: [] })
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

  // ─── Cycle detection ────────────────────────────────────────────────────

  it('detectCycle returns ok for an acyclic graph', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 'a', partId: 'think',    content: '', requiredCapabilities: [], dependsOn: [] })
    dag.addNode({ taskId: 'b', partId: 'summarize', content: '', requiredCapabilities: [], dependsOn: ['a'] })
    dag.addNode({ taskId: 'c', partId: 'critique',  content: '', requiredCapabilities: [], dependsOn: ['b'] })
    expect(dag.detectCycle().isOk()).toBe(true)
  })

  it('detectCycle returns err for a direct cycle (a -> b -> a)', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 'a', partId: 'think',    content: '', requiredCapabilities: [], dependsOn: ['b'] })
    dag.addNode({ taskId: 'b', partId: 'summarize', content: '', requiredCapabilities: [], dependsOn: ['a'] })
    const result = dag.detectCycle()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toMatch(/cycle/i)
  })

  it('detectCycle returns err for a transitive cycle (a -> b -> c -> a)', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 'a', partId: 'think',    content: '', requiredCapabilities: [], dependsOn: ['c'] })
    dag.addNode({ taskId: 'b', partId: 'summarize', content: '', requiredCapabilities: [], dependsOn: ['a'] })
    dag.addNode({ taskId: 'c', partId: 'critique',  content: '', requiredCapabilities: [], dependsOn: ['b'] })
    expect(dag.detectCycle().isErr()).toBe(true)
  })
})

// ─── DagBuilder ──────────────────────────────────────────────────────────────

describe('DagBuilder', () => {
  it('addTask returns ok for known part', () => {
    expect(makeBuilder().addTask('think').isOk()).toBe(true)
  })

  it('addTask returns err for unknown part', () => {
    expect(makeBuilder().addTask('unknown').isErr()).toBe(true)
  })

  it('chain wires tasks sequentially', () => {
    const r = makeBuilder().chain(['think', 'summarize', 'critique'])
    expect(r.isOk()).toBe(true)
    expect(r._unsafeUnwrap()).toHaveLength(3)
  })

  it('parallel adds tasks with no dependencies between them', () => {
    const r = makeBuilder().parallel(['think', 'summarize'])
    expect(r.isOk()).toBe(true)
    expect(r._unsafeUnwrap()).toHaveLength(2)
  })

  it('addDependency(independent, dependant) wires correctly', () => {
    const builder = makeBuilder()
    const a = builder.addTask('think')._unsafeUnwrap()
    const b = builder.addTask('summarize')._unsafeUnwrap()
    expect(builder.addDependency(a, b).isOk()).toBe(true)
    const levels = builder.build(new Set(), new JsonPromptFormatter())
    const plan = JSON.parse(levels)
    const ids = plan.tasks.map((t: { id: string }) => t.id)
    expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b))
  })

  it('build filters out tasks whose capabilities are not met', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    builder.addTask('web')
    const output = builder.build(new Set())
    expect(output).not.toContain('Search the web')
    expect(output).toContain('Think step by step')
  })

  it('build includes capability-gated task when cap is present', () => {
    const builder = makeBuilder()
    builder.addTask('web')
    expect(builder.build(new Set(['web_search']))).toContain('Search the web')
  })

  it('build returns empty string when all tasks are filtered', () => {
    const builder = makeBuilder()
    builder.addTask('web')
    expect(builder.build(new Set())).toBe('')
  })

  it('build returns empty string when the dag contains a cycle', () => {
    const builder = makeBuilder()
    const a = builder.addTask('think')._unsafeUnwrap()
    const b = builder.addTask('summarize')._unsafeUnwrap()
    // Manually inject a cycle directly into the dag nodes
    const nodeA = (builder as any)._dag.getNode(a)!
    const nodeB = (builder as any)._dag.getNode(b)!
    nodeA.dependsOn.push(b)
    nodeB.dependsOn.push(a)
    expect(builder.build(new Set())).toBe('')
  })

  it('setDefaultFormatter overrides per-instance without affecting others', () => {
    const b1 = makeBuilder()
    const b2 = makeBuilder()
    b1.addTask('think')
    b2.addTask('think')
    b1.setDefaultFormatter(new JsonPromptFormatter())
    expect(b1.build(new Set())).toContain('format_version')
    expect(b2.build(new Set())).toContain('<sequential>')
  })

  // ─── addPreset ─────────────────────────────────────────────────────

  it('addPreset returns err when no preset registry is configured', () => {
    expect(makeBuilder().addPreset('p_think').isErr()).toBe(true)
  })

  it('addPreset returns err for unknown presetId', () => {
    expect(makeBuilderWithPresets().addPreset('nonexistent').isErr()).toBe(true)
  })

  it('addPreset runs a defaultEnabled=true preset and returns one task id', () => {
    const builder = makeBuilderWithPresets()
    const r = builder.addPreset('p_think')
    expect(r.isOk()).toBe(true)
    expect(r._unsafeUnwrap()).toHaveLength(1)
    expect(builder.build(new Set())).toContain('Think step by step')
  })

  it('addPreset skips a defaultEnabled=false preset and returns empty array', () => {
    const builder = makeBuilderWithPresets()
    const r = builder.addPreset('p_summarize')
    expect(r.isOk()).toBe(true)
    expect(r._unsafeUnwrap()).toHaveLength(0)
    expect(builder.build(new Set())).toBe('')
  })

  it('addPreset with repeat=2 chains two tasks in topological order', () => {
    const builder = makeBuilderWithPresets()
    const r = builder.addPreset('p_critique')
    expect(r.isOk()).toBe(true)
    const ids = r._unsafeUnwrap()
    expect(ids).toHaveLength(2)
    // verify the two tasks are sequential, not parallel
    const parsed = JSON.parse(builder.build(new Set(), new JsonPromptFormatter()))
    const taskIds = parsed.tasks.map((t: { id: string }) => t.id)
    expect(taskIds.indexOf(ids[0])).toBeLessThan(taskIds.indexOf(ids[1]))
  })

  it('addPreset overrides.enabled=false skips an otherwise-enabled preset', () => {
    const builder = makeBuilderWithPresets()
    const r = builder.addPreset('p_think', { enabled: false })
    expect(r.isOk()).toBe(true)
    expect(r._unsafeUnwrap()).toHaveLength(0)
    expect(builder.build(new Set())).toBe('')
  })

  it('addPreset overrides.enabled=true runs a defaultEnabled=false preset', () => {
    const builder = makeBuilderWithPresets()
    const r = builder.addPreset('p_summarize', { enabled: true })
    expect(r.isOk()).toBe(true)
    expect(r._unsafeUnwrap()).toHaveLength(1)
    expect(builder.build(new Set())).toContain('Summarise in 3 bullets')
  })

  it('addPreset capability-gated part is excluded when cap absent', () => {
    // p_web maps to part 'web' which requires ['web_search']
    const builder = makeBuilderWithPresets()
    builder.addPreset('p_web')
    expect(builder.build(new Set())).toBe('')
  })

  it('addPreset capability-gated part is included when cap present', () => {
    const builder = makeBuilderWithPresets()
    builder.addPreset('p_web')
    expect(builder.build(new Set(['web_search']))).toContain('Search the web')
  })

  // ─── enablePreset / disablePreset ───────────────────────────────────

  it('enablePreset makes a defaultEnabled=false preset run', () => {
    const builder = makeBuilderWithPresets()
    builder.enablePreset('p_summarize')
    builder.addPreset('p_summarize')
    expect(builder.build(new Set())).toContain('Summarise in 3 bullets')
  })

  it('disablePreset prevents a defaultEnabled=true preset from running', () => {
    const builder = makeBuilderWithPresets()
    builder.disablePreset('p_think')
    builder.addPreset('p_think')
    expect(builder.build(new Set())).toBe('')
  })

  it('enablePreset returns this for chaining', () => {
    const builder = makeBuilderWithPresets()
    expect(builder.enablePreset('p_summarize')).toBe(builder)
  })

  it('disablePreset returns this for chaining', () => {
    const builder = makeBuilderWithPresets()
    expect(builder.disablePreset('p_think')).toBe(builder)
  })
})

// ─── Formatters ──────────────────────────────────────────────────────────────

describe('XmlPromptFormatter', () => {
  it('returns empty string for empty dag', () => {
    expect(new XmlPromptFormatter().generate(new PromptDag(), new Set())).toBe('')
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
    expect(builder.build(new Set(['parallel_tool_calls']), new XmlPromptFormatter())).toContain('<execution_plan>')
  })

  it('emits <await_completion> between parallel levels', () => {
    // Build a 2-level chain: a runs first, b depends on a
    const builder = makeBuilder()
    const a = builder.addTask('think')._unsafeUnwrap()
    const b = builder.addTask('summarize')._unsafeUnwrap()
    builder.addDependency(a, b)
    const output = builder.build(new Set(['parallel_tool_calls']), new XmlPromptFormatter())
    // Two levels → one await_completion between them
    expect(output).toContain('<await_completion level="0"/>')
    // Should NOT have one after the last level
    expect(output).not.toContain('<await_completion level="1"/>')
  })

  it('escapes XML special characters in content', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 't0', partId: 'x', content: '<b>&"test"</b>', requiredCapabilities: [], dependsOn: [] })
    const out = new XmlPromptFormatter().generate(dag, new Set())
    expect(out).toContain('&lt;b&gt;&amp;&quot;test&quot;&lt;/b&gt;')
  })
})

describe('JsonPromptFormatter', () => {
  it('returns {} for empty dag', () => {
    expect(new JsonPromptFormatter().generate(new PromptDag(), new Set())).toBe('{}')
  })

  it('produces valid JSON with tasks array', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const parsed = JSON.parse(builder.build(new Set(), new JsonPromptFormatter()))
    expect(Array.isArray(parsed.tasks)).toBe(true)
    expect(parsed.tasks[0].content).toBe('Think step by step.')
  })

  it('produces execution_levels when parallel_tool_calls present', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    const parsed = JSON.parse(builder.build(new Set(['parallel_tool_calls']), new JsonPromptFormatter()))
    expect(Array.isArray(parsed.execution_levels)).toBe(true)
  })
})

describe('MarkdownPromptFormatter', () => {
  it('returns empty string for empty dag', () => {
    expect(new MarkdownPromptFormatter().generate(new PromptDag(), new Set())).toBe('')
  })

  it('includes # Execution Plan heading', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    expect(builder.build(new Set(), new MarkdownPromptFormatter())).toContain('# Execution Plan')
  })
})

describe('ToonPromptFormatter', () => {
  it('returns empty string for empty dag', () => {
    expect(new ToonPromptFormatter().generate(new PromptDag(), new Set())).toBe('')
  })

  it('includes format_version header', () => {
    const builder = makeBuilder()
    builder.addTask('think')
    expect(builder.build(new Set(), new ToonPromptFormatter())).toContain('format_version: 1.0')
  })

  it('_toonValue wraps content containing a comma in double quotes', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 't0', partId: 'x', content: 'step one, step two', requiredCapabilities: [], dependsOn: [] })
    const out = new ToonPromptFormatter().generate(dag, new Set())
    // content contains a comma so it must be quoted
    expect(out).toContain('"step one, step two"')
  })

  it('_toonValue wraps content containing a newline in double quotes', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 't0', partId: 'x', content: 'line one\nline two', requiredCapabilities: [], dependsOn: [] })
    const out = new ToonPromptFormatter().generate(dag, new Set())
    expect(out).toContain('"line one\nline two"')
  })

  it('_toonValue does not quote plain content with no special characters', () => {
    const dag = new PromptDag()
    dag.addNode({ taskId: 't0', partId: 'x', content: 'simple', requiredCapabilities: [], dependsOn: [] })
    const out = new ToonPromptFormatter().generate(dag, new Set())
    // plain content — no wrapping quotes around the value
    expect(out).toContain(',simple')
    expect(out).not.toContain('"simple"')
  })
})

// ─── Default parts & presets ─────────────────────────────────────────────────

describe('DEFAULT_PROMPT_PARTS', () => {
  it('all ids are unique', () => {
    const ids = DEFAULT_PROMPT_PARTS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all parts have non-empty content', () => {
    for (const part of DEFAULT_PROMPT_PARTS)
      expect(part.content.length).toBeGreaterThan(0)
  })

  it('mermaid_dark_purple contains the full %%{init}%% block', () => {
    const part = DEFAULT_PROMPT_PARTS.find(p => p.id === 'mermaid_dark_purple')!
    expect(part.content).toContain('%%{init:')
    expect(part.content).toContain('primaryColor')
    expect(part.content).toContain('#7c3aed')
  })
})

describe('DEFAULT_PRESETS', () => {
  it('all presetIds are unique', () => {
    const ids = DEFAULT_PRESETS.map(p => p.presetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset.id references a known DEFAULT_PROMPT_PARTS id', () => {
    const partIds = new Set(DEFAULT_PROMPT_PARTS.map(p => p.id))
    for (const preset of DEFAULT_PRESETS)
      expect(partIds.has(preset.id), `preset "${preset.presetId}" -> unknown part "${preset.id}"`).toBe(true)
  })

  it('iterative_critique has repeat=2', () => {
    const preset = DEFAULT_PRESETS.find(p => p.presetId === 'iterative_critique')!
    expect(preset.repeat).toBe(2)
  })
})
