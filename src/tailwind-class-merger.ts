// utils/tailwind-class-merger.ts

interface ConflictGroups {
  [key: string]: string[]
}

const conflictGroups: ConflictGroups = {
  width: ['w-'],
  height: ['h-'],
  backgroundColor: ['bg-'],
  borderRadius: ['rounded'],
  display: ['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'hidden'],
  color: ['text-'],
  justify: ['justify-'],
  items: ['items-'],
  fontWeight: [
    'font-thin',
    'font-light',
    'font-normal',
    'font-medium',
    'font-semibold',
    'font-bold',
  ],
  padding: ['p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-'],
  transition: ['transition-'],
}

function extractBaseClass(className: string): string {
  return className.includes(':') ? className.split(':', 2)[1] : className
}

function getConflictGroup(className: string): string | undefined {
  const baseClass = extractBaseClass(className)

  for (const [groupName, prefixes] of Object.entries(conflictGroups)) {
    if (prefixes.some((prefix) => baseClass.startsWith(prefix) || baseClass === prefix)) {
      return groupName
    }
  }

  return undefined
}

export function mergeTailwindClasses(baseClasses: string, overrideClasses: string): string {
  const base = baseClasses.split(' ').filter(Boolean)
  const overrides = overrideClasses.split(' ').filter(Boolean)

  const overriddenGroups = new Set<string>()

  for (const overrideClass of overrides) {
    const group = getConflictGroup(overrideClass)
    if (group) {
      overriddenGroups.add(group)
    }
  }

  const filteredBase = base.filter((baseClass) => {
    const group = getConflictGroup(baseClass)
    return !group || !overriddenGroups.has(group)
  })

  return [...filteredBase, ...overrides].join(' ')
}
