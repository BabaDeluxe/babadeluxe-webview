import { GitBaseProviderDriver } from './git-base-provider-driver'
import { type GitHubConfig } from '@/sync/types'

export class GitHubProviderDriver extends GitBaseProviderDriver {
  readonly name = 'github'
  private readonly _branch: string
  protected readonly _repoSizePath: string

  constructor(private readonly _config: GitHubConfig) {
    super()
    this._branch = _config.branch || 'main'
    this._repoSizePath = `repos/${this._config.owner}/${this._config.repo}`
  }

  getRootUrl(): string {
    return `repos/${this._config.owner}/${this._config.repo}/contents/`
  }

  protected _getHeaders(): Record<string, string> {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
      Authorization: `Bearer ${this._config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    /* eslint-enable @typescript-eslint/naming-convention */
  }

  protected async _performTestCall() {
    return this._fetch(`${this._getApiBase()}/${this._repoSizePath}`)
  }

  protected _extractSize(body: unknown): number {
    return ((body as { size?: number }).size || 0) * 1024
  }

  protected _getApiBase(): string {
    return 'https://api.github.com'
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const url = `${this._getApiBase()}/${shardUrl}${path}`
    const getRes = await this._fetch(`${url}?ref=${this._branch}`)
    let sha: string | undefined
    if (getRes.status === 200) {
      const data = (await getRes.json()) as { sha: string }
      sha = data.sha
    }

    const res = await this._fetch(url, {
      method: 'PUT',
      body: JSON.stringify({
        message: `sync: write ${path}`,
        content,
        branch: this._branch,
        sha,
      }),
    })
    if (!res.ok) throw new Error(`Failed to PUT file ${path}: ${res.status}`)
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const url = `${this._getApiBase()}/${shardUrl}${path}`
    const res = await this._fetch(`${url}?ref=${this._branch}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    const data = (await res.json()) as { content: string }
    return data.content.replace(/\n/g, '')
  }
}
