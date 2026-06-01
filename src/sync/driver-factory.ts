import { GitHubProviderDriver } from './github-adapter'
import { GitLabProviderDriver } from './gitlab-adapter'
import { CodebergProviderDriver } from './codeberg-adapter'
import { WebDavProviderDriver } from './webdav-adapter'
import { AzureDevOpsProviderDriver } from './azure-devops-adapter'
import { ShardedSyncService } from './sharded-sync-service'
import type { ISyncAdapter, SyncConfig } from './types'

export class SyncAdapterFactory {
  static create(config: SyncConfig): ISyncAdapter {
    let driver
    switch (config.provider) {
      case 'github':
        driver = new GitHubProviderDriver({
          token: config.token!,
          owner: config.owner!,
          repo: config.repo!,
          branch: config.branch,
        })
        break
      case 'gitlab':
        driver = new GitLabProviderDriver({
          token: config.token!,
          projectId: config.projectId!,
          apiBase: config.apiBase,
        })
        break
      case 'codeberg':
        driver = new CodebergProviderDriver({
          token: config.token!,
          repo: config.repo!,
        })
        break
      case 'webdav':
        driver = new WebDavProviderDriver({
          url: config.url!,
          username: config.username!,
          password: config.password!,
        })
        break
      case 'azure-devops':
        driver = new AzureDevOpsProviderDriver({
          org: config.org!,
          project: config.project!,
          repo: config.repo!,
          pat: config.pat!,
          apiBase: config.apiBase,
        })
        break
      default:
        throw new Error(`Unsupported sync provider: ${config.provider}`)
    }
    return new ShardedSyncService(driver)
  }
}
