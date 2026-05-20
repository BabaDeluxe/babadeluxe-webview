/**
 * Lightweight class merge utility for UnoCSS + custom token class names.
 *
 * Uses last-write-wins for known conflicting CSS property prefixes.
 * Non-conflicting classes (layout, spacing, radius, etc.) are always preserved.
 *
 * Replaces tailwind-merge in this project because twMerge cannot resolve
 * conflicts between standard Tailwind classes and UnoCSS custom token classes
 * (e.g. text-white vs text-deepText).
 */

const conflictingPrefixes = [
  'text-',
  'bg-',
  'border-',
  'ring-',
  'opacity-',
  'cursor-',
  'pointer-events-',
] as const

type ClassInput = string | undefined | null | false

export function mergeUnoClasses(...inputs: ClassInput[]): string {
  const kept = new Map<string, string>() // prefix → last class with that prefix
  const nonConflicting: string[] = []

  for (const input of inputs) {
    if (!input) continue
    for (const cls of input.split(/\s+/)) {
      if (!cls) continue
      const prefix = conflictingPrefixes.find((p) =>
        cls === p.slice(0, -1)
          ? false // exact prefix token with no suffix — not conflicting
          : cls.startsWith(p)
      )
      if (prefix) {
        kept.set(prefix, cls)
      } else {
        nonConflicting.push(cls)
      }
    }
  }

  return [...nonConflicting, ...kept.values()].join(' ').trim()
}
