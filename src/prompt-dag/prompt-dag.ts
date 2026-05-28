import { ok, err, type Result } from 'neverthrow'
import type { TaskNode } from './types.js'

export class PromptDag {
  private _nodes = new Map<string, TaskNode>()

  addNode(node: TaskNode): void {
    this._nodes.set(node.taskId, { ...node, dependsOn: [...node.dependsOn] })
  }

  getNode(id: string): TaskNode | undefined {
    return this._nodes.get(id)
  }

  getAllNodes(): TaskNode[] {
    return Array.from(this._nodes.values())
  }

  removeNode(id: string): void {
    this._nodes.delete(id)
  }

  /**
   * DFS-based cycle detection. O(V + E).
   * Returns ok(undefined) when the graph is acyclic,
   * err(Error) with the offending edge when a back-edge is found.
   */
  detectCycle(): Result<void, Error> {
    const WHITE = 0, GRAY = 1, BLACK = 2
    const color = new Map<string, number>()
    for (const n of this._nodes.keys()) color.set(n, WHITE)

    const visit = (id: string): Result<void, Error> => {
      color.set(id, GRAY)
      const node = this._nodes.get(id)!
      for (const dep of node.dependsOn) {
        if (color.get(dep) === GRAY)
          return err(new Error(`Cycle detected: "${dep}" -> "${id}" creates a cycle`))
        if (color.get(dep) === WHITE) {
          const r = visit(dep)
          if (r.isErr()) return r
        }
      }
      color.set(id, BLACK)
      return ok(undefined)
    }

    for (const id of this._nodes.keys()) {
      if (color.get(id) === WHITE) {
        const r = visit(id)
        if (r.isErr()) return r
      }
    }
    return ok(undefined)
  }

  removeOrphans(): void {
    const allNodes = this.getAllNodes()
    const reachable = new Set<string>()

    for (const n of allNodes) {
      if (n.dependsOn.length === 0) reachable.add(n.taskId)
    }

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
