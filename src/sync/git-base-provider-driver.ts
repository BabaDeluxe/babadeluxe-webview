import { BaseProviderDriver } from './base-provider-driver'

export abstract class GitBaseProviderDriver extends BaseProviderDriver {
  protected abstract _repoSizePath: string

  async isShardFull(): Promise<boolean> {
    try {
      const res = await this._fetch(`${this._getApiBase()}/${this._repoSizePath}`)
      if (!res.ok) return false
      const body = (await res.json()) as { size?: number }
      const size = this._extractSize(body)
      return size > 4800000000
    } catch {
      return false
    }
  }

  protected abstract _extractSize(body: unknown): number

  async createNewShardFolder(index: number): Promise<string> {
    return `${this.getRootUrl()}shard-${index}/`
  }

  protected abstract _getApiBase(): string
}
