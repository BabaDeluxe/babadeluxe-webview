export function getDisambiguatedPaths(paths: string[]): Map<string, string> {
  const labelMap = new Map<string, string>()
  const groups = new Map<string, string[]>()

  // Group by filename
  for (const path of paths) {
    const filename = path.split(/[/\\\\]/).pop() ?? path
    const existingGroup = groups.get(filename)

    if (existingGroup) existingGroup.push(path)
    else groups.set(filename, [path])
  }

  // Disambiguate collisions
  for (const [filename, group] of groups) {
    if (group.length === 1) {
      labelMap.set(group[0], filename)
      continue
    }

    // Collision detected: Add parent dirs until unique
    for (const path of group) {
      const parts = path.split(/[/\\\\]/)
      let label = filename
      let depth = 1

      while (true) {
        const parentIndex = parts.length - 1 - depth
        if (parentIndex < 0) break

        const candidate = `${parts[parentIndex]}/${label}`

        const conflicts = group.filter((other) => other !== path && other.endsWith(candidate))

        label = candidate

        if (conflicts.length === 0) break
        depth++
      }
      labelMap.set(path, label)
    }
  }
  return labelMap
}
