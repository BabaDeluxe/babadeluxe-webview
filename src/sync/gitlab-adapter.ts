import { GitBaseProviderDriver } from './git-base-provider-driver'
import { type GitLabConfig } from '@/sync/types'

export class GitLabProviderDriver extends GitBaseProviderDriver {
  readonly name = 'gitlab'
  private readonly _apiBase: string
  protected readonly _repoSizePath: string

  constructor(private readonly _config: GitLabConfig) {
    super()
    this._apiBase = this._config.apiBase || 'https://gitlab.com/api/v4'
    this._repoSizePath = `projects/${this._config.projectId}`
  }

  getRootUrl(): string {
    return `projects/${this._config.projectId}/repository/files/`
  }

  protected _getHeaders(): Record<string, string> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return { Authorization: `Bearer ${this._config.token}` }
  }

  protected async _performTestCall() {
    return this._fetch(`${this._apiBase}/user`)
  }

  protected _extractSize(body: unknown): number {
    return (
      (
        body as {
          statistics?: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            repository_size?: number
          }
        }
      ).statistics?.repository_size || 0
    )
  }

  protected _getApiBase(): string {
    return this._apiBase
  }

  async isShardFull(): Promise<boolean> {
    try {
      const res = await this._fetch(`${this._apiBase}/${this._repoSizePath}?statistics=true`)
      if (!res.ok) return false
      const body = await res.json()
      return this._extractSize(body) > 4800000000
    } catch {
      return false
    }
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const encodedPath = encodeURIComponent(path)
    const url = `${this._apiBase}/${shardUrl}${encodedPath}`
    const checkRes = await this._fetch(`${url}?ref=main`, { method: 'HEAD' })
    const method = checkRes.ok ? 'PUT' : 'POST'
    const res = await this._fetch(url, {
      method,
      body: JSON.stringify({
        branch: 'main',
        content,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        commit_message: `sync: write ${path}`,
        encoding: 'base64',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`Failed to ${method} file ${path}: ${res.status}`)
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const encodedPath = encodeURIComponent(path)
    const url = `${this._apiBase}/${shardUrl}${encodedPath}?ref=main`
    const res = await this._fetch(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    const data = (await res.json()) as { content: string }
    return data.content
  }

  async createNewShardFolder(index: number): Promise<string> {
    return `${this.getRootUrl()}shard-${index}%2F`
  }
}
