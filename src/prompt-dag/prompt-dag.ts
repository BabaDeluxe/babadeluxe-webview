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
    const indegree = new Map<string, number>()
    for (const n of allNodes) indegree.set(n.taskId, n.dependsOn.length)

    const sources = allNodes.filter(n => (indegree.get(n.taskId) ?? 0) === 0)
    const reachable = new Set<string>()
    const queue = sources.map(s => s.taskId)
    for (const id of queue) reachable.add(id)

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const [id, node] of this.nodes) {
        if (node.dependsOn.includes(current) && !reachable.has(id)) {
          reachable.add(id)
          queue.push(id)
        }
      }
    }

    for (const node of allNodes) {
      if (reachable.has(node.taskId))
        node.dependsOn = node.dependsOn.filter(depId => reachable.has(depId))
    }

    for (const node of allNodes) {
      if (!reachable.has(node.taskId)) this.removeNode(node.taskId)
    }
  }

  topologicalLevels(): TaskNode[][] {
    const levels: TaskNode[][] = []
    const inDegree = new Map<string, number>()
    const nodes = this.getAllNodes()

    for (const n of nodes) inDegree.set(n.taskId, n.dependsOn.length)
    const queue: string[] = []

    for (const n of nodes) {
      if (inDegree.get(n.taskId) === 0) queue.push(n.taskId)
    }

    while (queue.length > 0) {
      const levelSize = queue.length
      const currentLevel: TaskNode[] = []
      for (let i = 0; i < levelSize; i++) {
        const taskId = queue.shift()!
        const node = this.getNode(taskId)!
        currentLevel.push(node)

        for (const depNode of nodes) {
          if (depNode.dependsOn.includes(taskId)) {
            const newCount = (inDegree.get(depNode.taskId) ?? 1) - 1
            inDegree.set(depNode.taskId, newCount)
            if (newCount === 0) queue.push(depNode.taskId)
          }
        }
      }
      if (currentLevel.length > 0) levels.push(currentLevel)
    }
    return levels
  }

  topologicalSort(): TaskNode[] {
    return this.topologicalLevels().flat()
  }
}
