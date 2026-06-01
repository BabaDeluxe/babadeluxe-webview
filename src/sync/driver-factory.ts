import { GitHubBackendDriver } from './github-adapter'
import { GitLabBackendDriver } from './gitlab-adapter'
import { CodebergBackendDriver } from './codeberg-adapter'
import { WebDavBackendDriver } from './webdav-adapter'
import { AzureDevOpsBackendDriver } from './azure-devops-adapter'
import { ShardedSyncService } from './sharded-sync-service'
import type { ISyncAdapter, SyncConfig } from './types'

export class SyncAdapterFactory {
  static create(config: SyncConfig): ISyncAdapter {
    let driver
    switch (config.backend) {
      case 'github':
        driver = new GitHubBackendDriver({
          token: config.token!,
          owner: config.owner!,
          repo: config.repo!,
          branch: config.branch,
        })
        break
      case 'gitlab':
        driver = new GitLabBackendDriver({
          token: config.token!,
          projectId: config.projectId!,
          apiBase: config.apiBase,
        })
        break
      case 'codeberg':
        driver = new CodebergBackendDriver({
          token: config.token!,
          repo: config.repo!,
        })
        break
      case 'webdav':
        driver = new WebDavBackendDriver({
          url: config.url!,
          username: config.username!,
          password: config.password!,
        })
        break
      case 'azure-devops':
        driver = new AzureDevOpsBackendDriver({
          org: config.org!,
          project: config.project!,
          repo: config.repo!,
          pat: config.pat!,
          apiBase: config.apiBase,
        })
        break
      default:
        throw new Error(`Unsupported sync backend: ${config.backend}`)
    }
    return new ShardedSyncService(driver)
  }
}
