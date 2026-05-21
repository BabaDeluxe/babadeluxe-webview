/**
 * VS Code Extension Host — SFTP host service.
 *
 * This module runs in the extension host (Node.js), NOT in the webview.
 * It receives sync:sftp:* messages from SftpBridgeAdapter via the webview
 * postMessage bridge and performs actual SFTP I/O using ssh2-sftp-client.
 *
 * Usage in your extension's activate():
 *
 *   import { SftpHostService } from './sftp-host-service'
 *
 *   const sftp = new SftpHostService(panel.webview, {
 *     host: '…', port: 22, username: '…', privateKey: await getKeyFromSecretStorage(),
 *   })
 *   sftp.listen()
 *
 * The webview panel's onDidReceiveMessage is wired through SftpHostService.listen().
 * Credentials are fetched from VS Code SecretStorage — never hardcoded or stored in app-db.
 */

// NOTE: The import below is a dynamic import to keep this file tree-shakeable.
// ssh2-sftp-client is a Node-only package and must never be bundled into the webview.
// Import it only at the extension host boundary.

export type SftpHostConfig = {
  host: string
  port: number
  username: string
  /** Private key (PEM string) or password — sourced from SecretStorage by the caller */
  authValue: string
  authType: 'privateKey' | 'password'
}

export type WebviewPanel = {
  webview: {
    postMessage(message: unknown): void
    onDidReceiveMessage: (listener: (message: unknown) => void) => { dispose(): void }
  }
}

type SftpMessage = {
  type: string
  requestId: string
  [key: string]: unknown
}

function isSftpMessage(msg: unknown): msg is SftpMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as Record<string, unknown>).type === 'string' &&
    typeof (msg as Record<string, unknown>).requestId === 'string' &&
    ((msg as Record<string, unknown>).type as string).startsWith('sync:sftp:')
  )
}

export class SftpHostService {
  private _disposable: { dispose(): void } | null = null

  constructor(
    private readonly _panel: WebviewPanel,
    private readonly _config: SftpHostConfig
  ) {}

  listen(): void {
    this._disposable = this._panel.webview.onDidReceiveMessage(async (msg: unknown) => {
      if (!isSftpMessage(msg)) return
      await this._handle(msg)
    })
  }

  dispose(): void {
    this._disposable?.dispose()
    this._disposable = null
  }

  private async _handle(msg: SftpMessage): Promise<void> {
    switch (msg.type) {
      case 'sync:sftp:test':
        await this._handleTest(msg)
        break
      case 'sync:sftp:push':
        await this._handlePush(msg)
        break
      case 'sync:sftp:pull':
        await this._handlePull(msg)
        break
      case 'sync:sftp:delete':
        await this._handleDelete(msg)
        break
    }
  }

  private async _handleTest(msg: SftpMessage): Promise<void> {
    // Dynamic import — ssh2-sftp-client is Node-only, never bundled into webview
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SftpClient = (await import('ssh2-sftp-client')).default
    const client = new SftpClient()
    try {
      await client.connect(this._connectConfig())
      await client.end()
      this._reply(msg.requestId, {})
    } catch (e) {
      this._reply(msg.requestId, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  private async _handlePush(msg: SftpMessage): Promise<void> {
    const path = msg.path as string
    const content = msg.content as string
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SftpClient = (await import('ssh2-sftp-client')).default
    const client = new SftpClient()
    try {
      await client.connect(this._connectConfig())
      // Ensure parent directory exists
      const dir = path.substring(0, path.lastIndexOf('/'))
      await client.mkdir(dir, true)
      // Write-then-rename for atomicity: write to .tmp, then rename
      const tmpPath = `${path}.tmp`
      const buffer = Buffer.from(content, 'utf-8')
      await client.put(buffer, tmpPath)
      await client.rename(tmpPath, path)
      await client.end()
      this._reply(msg.requestId, {})
    } catch (e) {
      this._reply(msg.requestId, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  private async _handlePull(msg: SftpMessage): Promise<void> {
    const dirPath = msg.dirPath as string
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SftpClient = (await import('ssh2-sftp-client')).default
    const client = new SftpClient()
    try {
      await client.connect(this._connectConfig())

      // List files in directory; if dir doesn't exist yet return empty
      let listing: Array<{ name: string }> = []
      try {
        listing = (await client.list(dirPath)) as Array<{ name: string }>
      } catch {
        // Directory not yet created — treat as empty
      }

      const files: Array<{ path: string; content: string }> = []
      for (const entry of listing) {
        if (!entry.name.endsWith('.json')) continue
        const filePath = `${dirPath}${entry.name}`
        try {
          const buffer = await client.get(filePath) as Buffer
          files.push({ path: filePath, content: buffer.toString('utf-8') })
        } catch {
          // Skip unreadable files — don't abort entire pull
        }
      }

      await client.end()
      this._reply(msg.requestId, { files })
    } catch (e) {
      this._reply(msg.requestId, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  private async _handleDelete(msg: SftpMessage): Promise<void> {
    const path = msg.path as string
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SftpClient = (await import('ssh2-sftp-client')).default
    const client = new SftpClient()
    try {
      await client.connect(this._connectConfig())
      try {
        await client.delete(path)
      } catch {
        // File already gone — treat as success
      }
      await client.end()
      this._reply(msg.requestId, {})
    } catch (e) {
      this._reply(msg.requestId, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  private _reply(requestId: string, payload: Record<string, unknown>): void {
    this._panel.webview.postMessage({ requestId, ...payload })
  }

  private _connectConfig(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      host: this._config.host,
      port: this._config.port,
      username: this._config.username,
      readyTimeout: 10_000,
    }
    if (this._config.authType === 'privateKey') {
      base.privateKey = this._config.authValue
    } else {
      base.password = this._config.authValue
    }
    return base
  }
}
