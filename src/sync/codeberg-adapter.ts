import { GitBaseBackendDriver } from './git-base-driver'
import { type CodebergConfig } from '@/sync/types'

export class CodebergBackendDriver extends GitBaseBackendDriver {
  readonly name = 'codeberg'
  protected readonly _repoSizePath: string

  constructor(private readonly _config: CodebergConfig) {
    super()
    this._repoSizePath = `repos/${this._config.repo}`
  }

  getRootUrl(): string {
    return `repos/${this._config.repo}/contents/`
  }

  protected _getHeaders(): Record<string, string> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return { Authorization: `token ${this._config.token}` }
  }

  protected async _performTestCall() {
    return this._fetch(`${this._getApiBase()}/${this._repoSizePath}`)
  }

  protected _extractSize(body: unknown): number {
    return ((body as { size?: number }).size || 0) * 1024
  }

  protected _getApiBase(): string {
    return 'https://codeberg.org/api/v1'
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const url = `${this._getApiBase()}/${shardUrl}${path}`
    const getRes = await this._fetch(url)
    let sha: string | undefined
    if (getRes.status === 200) {
      const data = (await getRes.json()) as { sha: string }
      sha = data.sha
    }
    const method = sha ? 'PUT' : 'POST'
    const res = await this._fetch(url, {
      method,
      body: JSON.stringify({
        message: `sync: write ${path}`,
        content,
        sha,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`Failed to ${method} file ${path}: ${res.status}`)
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const url = `${this._getApiBase()}/${shardUrl}${path}`
    const res = await this._fetch(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    const data = (await res.json()) as { content: string }
    return data.content.replace(/\n/g, '')
  }
}
