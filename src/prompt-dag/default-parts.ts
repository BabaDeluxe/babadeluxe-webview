import type { PromptPartPOJO } from './types.js'

const MERMAID_DARK_PURPLE_THEME = `When producing Mermaid diagrams, always use the following theme configuration to ensure WCAG 7.0 contrast and dark+purple styling, renderable on GitHub:
\`\`\`mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#7c3aed',
  'primaryTextColor': '#ffffff',
  'primaryBorderColor': '#a78bfa',
  'lineColor': '#a78bfa',
  'secondaryColor': '#1e1b4b',
  'tertiaryColor': '#2e1065',
  'background': '#0f0a1a',
  'mainBkg': '#1e1b4b',
  'nodeBorder': '#7c3aed',
  'clusterBkg': '#2e1065',
  'clusterBorder': '#a78bfa',
  'titleColor': '#e0e7ff',
  'edgeLabelBackground': '#1e1b4b'
}}}%%
\`\`\`
Use this block verbatim before the diagram code.`

export const DEFAULT_PROMPT_PARTS: PromptPartPOJO[] = [
  { id: 'think',                content: 'Think step by step and show your reasoning before giving the final answer.' },
  { id: 'socratic',             content: 'Use the Socratic method: ask probing questions that guide the user to discover the answer themselves.' },
  { id: 'cross_source',         content: 'Compare information from multiple sources. Highlight agreements, contradictions, and gaps.' },
  { id: 'ask_clarify',          content: 'If anything is unclear or ambiguous, ask clarifying questions before proceeding.' },
  { id: 'self_heal_json',       content: 'You must output valid JSON. If your output contains any JSON syntax error, fix it and re\u2011output the corrected JSON.' },
  { id: 'ignore_gitignore',     content: 'Ignore all files and directories that match any glob pattern listed in .gitignore. Do not read, access, or refer to them.' },
  { id: 'paul_elder',           content: 'Apply the Paul\u2011Elder critical thinking framework:\n1. **Purpose** \u2013 What is the goal?\n2. **Question** \u2013 What is the central question?\n3. **Information** \u2013 What data, evidence, and observations are relevant?\n4. **Interpretation** \u2013 How is the information being interpreted?\n5. **Concepts** \u2013 What key concepts or theories are involved?\n6. **Assumptions** \u2013 What assumptions are being made?\n7. **Implications** \u2013 What are the consequences and implications?\n8. **Points of view** \u2013 From which perspectives are we reasoning?\nBe exhaustive and self\u2011critical.' },
  { id: 'counter_assumptions',  content: 'For every statement or claim you make:\n- List the underlying assumptions.\n- Invent plausible counter\u2011assumptions that would challenge or reverse the statement.\n- Evaluate which set of assumptions is more logically valid, using rigorous, high\u2011IQ reasoning.\n- Conclude which position is better supported after this comparison.' },
  { id: 'verify_complete',      content: 'Before marking any task as done, double\u2011check that you have fully and exactly completed every requirement. If not, explain what is missing and re\u2011do it.' },
  { id: 'challenge_user',       content: 'Never assume the user is correct unless:\n- They speak from verifiable personal experience, or\n- They explicitly warrant that their statement is true and you cannot find a reputable source that contradicts them.\nIf you find a contradiction, explain why they are wrong and cite the contradicting source.' },
  { id: 'mermaid_dark_purple',  content: MERMAID_DARK_PURPLE_THEME },
  { id: 'no_harm',              content: 'Do not generate content that is illegal, harmful, or unethical. If asked, politely refuse and explain why.' },
  { id: 'cite_sources',         content: 'Always cite your sources with links or references when making factual claims.' },
  { id: 'verify_sources',       content: 'Before using any source, verify that it actually exists. Use web search to locate the original publication or the exact document. If the source cannot be confirmed, state that and do not rely on it.' },
  { id: 'file_tool',            content: 'If you need to read, write, or list files, use the provided file system tools. Always confirm the file operation succeeded before proceeding.', requiredCapabilities: ['file_system'] },
  { id: 'research',             content: 'Search for latest AI trends.', requiredCapabilities: ['web_search'] },
  { id: 'summarize',            content: 'Summarise research in 3 bullet points.' },
  { id: 'critique',             content: 'Critique the previous answer. Identify weaknesses, errors, and assumptions. Then produce an improved version.' },
  { id: 'pro_tip',              content: 'At the end of each response, include a **Pro Tip** section if you have an especially useful insight or advanced technique that can help the user. Otherwise, skip it.' },
  { id: 'grok_lines',           content: 'When explaining a concept, provide a **Grok Lines** section: a minimal glossary\u2011like mapping of the 2\u20135 most essential terms to their plain\u2011English definitions. Keep each definition one sentence.' },
  { id: 'format_json_example',  content: 'You must respond with valid JSON only. Use this exact structure as a template:\n{"analysis": "string", "conclusion": "string", "sources": ["string"]}\nDo not include any text outside the JSON.' },
  { id: 'format_markdown_example', content: 'You must respond using Markdown. Follow this structure:\n# Title\n## Summary\n- Bullet 1\n- Bullet 2\n## Details\nExplanation text here.\n## Sources\n1. Source one\n2. Source two' },
  { id: 'format_toon_example',  content: 'You must respond using TOON (Token-Oriented Object Notation). For example:\nresult: success\ndata[2]{name,value}:\n  AI,10\n  Blockchain,8' },
  { id: 'eli5',                 content: 'Explain this as if I were a 5\u2011year\u2011old child. Use very simple words, short sentences, and concrete analogies. No jargon.' },
  { id: 'eli14',                content: 'Explain this as if I were a 14\u2011year\u2011old student. Use clear, straightforward language, avoid unnecessary jargon, and give relatable examples.' },
]
