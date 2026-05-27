import type { TaskNode } from './types.js'

export class PromptDag {
  private nodes = new Map<string, TaskNode>()

  addNode(node: TaskNode): void {
    this.nodes.set(node.taskId, { ...node, dependsOn: [...node.dependsOn] })
  }

  getNode(id: string): TaskNode | undefined {
    return this.nodes.get(id)
  }

  getAllNodes(): TaskNode[] {
    return Array.from(this.nodes.values())
  }

  removeNode(id: string): void {
    this.nodes.delete(id)
  }

  removeOrphans(): void {
    const allNodes = this.getAllNodes()
    const reachable = new Set<string>()

    // Seed with true source nodes (no dependencies)
    for (const n of allNodes) {
      if (n.dependsOn.length === 0) reachable.add(n.taskId)
    }

    // BFS forward through the graph
    const queue = Array.from(reachable)
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const node of allNodes) {
        if (!reachable.has(node.taskId) && node.dependsOn.includes(current)) {
          reachable.add(node.taskId)
          queue.push(node.taskId)
        }
      }
    }

    // Strip dangling edges then remove unreachable nodes
    for (const node of allNodes) {
      if (reachable.has(node.taskId)) {
        node.dependsOn = node.dependsOn.filter(depId => reachable.has(depId))
      } else {
        this.removeNode(node.taskId)
      }
    }
  }

  topologicalLevels(): TaskNode[][] {
    const nodes = this.getAllNodes()
    if (nodes.length === 0) return []

    // Build inDegree and inverted adjacency map in one pass — O(E) not O(N²)
    const inDegree = new Map<string, number>()
    const children = new Map<string, string[]>()

    for (const n of nodes) {
      if (!inDegree.has(n.taskId)) inDegree.set(n.taskId, 0)
      if (!children.has(n.taskId)) children.set(n.taskId, [])
      for (const dep of n.dependsOn) {
        inDegree.set(n.taskId, (inDegree.get(n.taskId) ?? 0) + 1)
        if (!children.has(dep)) children.set(dep, [])
        children.get(dep)!.push(n.taskId)
      }
    }

    // Wait — inDegree was double-counted above. Recompute cleanly.
    const inDeg = new Map<string, number>(nodes.map(n => [n.taskId, n.dependsOn.length]))
    const adj = new Map<string, string[]>(nodes.map(n => [n.taskId, []]))
    for (const n of nodes) {
      for (const dep of n.dependsOn) {
        adj.get(dep)?.push(n.taskId)
      }
    }

    const levels: TaskNode[][] = []
    let frontier = nodes.filter(n => inDeg.get(n.taskId) === 0).map(n => n.taskId)

    while (frontier.length > 0) {
      levels.push(frontier.map(id => this.getNode(id)!))
      const next: string[] = []
      for (const id of frontier) {
        for (const childId of adj.get(id) ?? []) {
          const newDeg = (inDeg.get(childId) ?? 1) - 1
          inDeg.set(childId, newDeg)
          if (newDeg === 0) next.push(childId)
        }
      }
      frontier = next
    }

    return levels
  }

  topologicalSort(): TaskNode[] {
    return this.topologicalLevels().flat()
  }
}
