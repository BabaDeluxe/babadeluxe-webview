import type { PromptPresetPOJO } from './types.js'

export const DEFAULT_PRESETS: PromptPresetPOJO[] = [
  // Reasoning
  { presetId: 'visible_thinking',        id: 'think',               category: 'reasoning',   defaultEnabled: true,  repeat: 1, description: 'Show step‑by‑step reasoning before answering.' },
  { presetId: 'socratic_questioning',    id: 'socratic',            category: 'reasoning',   defaultEnabled: false, repeat: 1, description: 'Guide user to discover answers via probing questions.' },
  { presetId: 'cross_source_analysis',   id: 'cross_source',        category: 'reasoning',   defaultEnabled: false, repeat: 1, description: 'Compare multiple sources for agreements and contradictions.' },
  { presetId: 'ask_before_act',          id: 'ask_clarify',         category: 'reasoning',   defaultEnabled: true,  repeat: 1, description: 'Clarify ambiguities before proceeding.' },
  { presetId: 'paul_elder_thinking',     id: 'paul_elder',          category: 'reasoning',   defaultEnabled: false, repeat: 1, description: 'Apply the Paul‑Elder critical thinking framework.' },
  { presetId: 'counter_assumption',      id: 'counter_assumptions', category: 'reasoning',   defaultEnabled: false, repeat: 1, description: 'Challenge every claim with counter‑assumptions.' },
  // Quality
  { presetId: 'verify_done',             id: 'verify_complete',     category: 'quality',     defaultEnabled: true,  repeat: 1, description: 'Double‑check all requirements before marking done.' },
  { presetId: 'challenge_correctness',   id: 'challenge_user',      category: 'quality',     defaultEnabled: false, repeat: 1, description: 'Never assume the user is correct without evidence.' },
  { presetId: 'self_heal',               id: 'self_heal_json',      category: 'quality',     defaultEnabled: false, repeat: 1, description: 'Auto‑fix JSON syntax errors in output.' },
  { presetId: 'iterative_critique',      id: 'critique',            category: 'quality',     defaultEnabled: false, repeat: 2, description: 'Critique and improve the answer twice.' },
  // Safety
  { presetId: 'safe_output',             id: 'no_harm',             category: 'safety',      defaultEnabled: true,  repeat: 1, description: 'Refuse illegal, harmful, or unethical content.' },
  { presetId: 'cite_everything',         id: 'cite_sources',        category: 'safety',      defaultEnabled: true,  repeat: 1, description: 'Always cite sources for factual claims.' },
  { presetId: 'verify_sources_exist',    id: 'verify_sources',      category: 'safety',      defaultEnabled: false, repeat: 1, description: 'Confirm every cited source actually exists.' },
  // Tools
  { presetId: 'use_file_tools',          id: 'file_tool',           category: 'tools',       defaultEnabled: true,  repeat: 1, description: 'Use file system tools for file operations.', requiredCapabilities: ['file_system'] },
  { presetId: 'web_research',            id: 'research',            category: 'tools',       defaultEnabled: false, repeat: 1, description: 'Search for latest AI trends.', requiredCapabilities: ['web_search'] },
  // Format
  { presetId: 'summarize_bullets',       id: 'summarize',           category: 'format',      defaultEnabled: false, repeat: 1, description: 'Summarise research in 3 bullet points.' },
  { presetId: 'add_pro_tip',             id: 'pro_tip',             category: 'format',      defaultEnabled: false, repeat: 1, description: 'Add a Pro Tip section when useful.' },
  { presetId: 'add_grok_lines',          id: 'grok_lines',          category: 'format',      defaultEnabled: false, repeat: 1, description: 'Add a minimal glossary of key terms.' },
  { presetId: 'output_json',             id: 'format_json_example', category: 'format',      defaultEnabled: false, repeat: 1, description: 'Respond with valid JSON only.' },
  { presetId: 'output_markdown',         id: 'format_markdown_example', category: 'format', defaultEnabled: false, repeat: 1, description: 'Respond using structured Markdown.' },
  { presetId: 'output_toon',             id: 'format_toon_example', category: 'format',      defaultEnabled: false, repeat: 1, description: 'Respond using TOON notation.' },
  // Diagrams
  { presetId: 'mermaid_style',           id: 'mermaid_dark_purple', category: 'diagrams',    defaultEnabled: false, repeat: 1, description: 'Use dark+purple Mermaid theme for diagrams.' },
  // Audience
  { presetId: 'explain_eli5',            id: 'eli5',                category: 'audience',    defaultEnabled: false, repeat: 1, description: 'Explain like the user is 5 years old.' },
  { presetId: 'explain_eli14',           id: 'eli14',               category: 'audience',    defaultEnabled: false, repeat: 1, description: 'Explain like the user is a 14‑year‑old student.' },
  // Codebase
  { presetId: 'respect_gitignore',       id: 'ignore_gitignore',    category: 'codebase',    defaultEnabled: true,  repeat: 1, description: 'Ignore files matching .gitignore patterns.' },
]
