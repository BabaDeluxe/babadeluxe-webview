import { computed, type ComputedRef, type Ref } from 'vue'
import { err, ok, type Result } from 'neverthrow'
import { NetworkError, SocketError } from '@/errors'
import { socketTimeoutMs } from '@/constants'
import { emitWithTimeout } from '@/emit-with-timeout'
import { fromWire } from '@/settings-utils'
import type { UserSettingWire, Root } from '@babadeluxe/shared'
import type { SettingsRepository } from './settings-repository'
import type { SocketManager } from '@/socket-manager'

type SettingsSocket = SocketManager['settingsSocket']

export class SocketSettingsRepository implements SettingsRepository {
  private readonly _settingsSocketRef: ComputedRef<SettingsSocket | undefined>

  public constructor(private readonly _socketManagerRef: Ref<SocketManager | undefined>) {
    this._settingsSocketRef = computed(() => this._socketManagerRef.value?.settingsSocket)
  }

  private async _ensureConnected(): Promise<Result<true, NetworkError>> {
    const socket = this._settingsSocketRef.value
    if (!socket) {
      return err(new SocketError('Settings socket not connected'))
    }

    const waitResult = await socket.waitForConnection()
    if (waitResult.isErr()) {
      const mappedError =
        waitResult.error instanceof NetworkError
          ? waitResult.error
          : new NetworkError('Connection failed', waitResult.error)

      return err(mappedError)
    }

    return ok(true)
  }

  public async loadSettings() {
    const connectionResult = await this._ensureConnected()
    if (connectionResult.isErr()) {
      return err(connectionResult.error)
    }

    const emitResult = await emitWithTimeout({
      socket: this._settingsSocketRef,
      actionName: 'settings:getAll',
      timeoutMs: socketTimeoutMs.settings,
    })

    if (emitResult.isErr()) {
      return err(new NetworkError('Failed to load settings', emitResult.error))
    }

    return ok(fromWire(emitResult.value as UserSettingWire[]))
  }

  public async upsertSetting(
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ) {
    const payload: Parameters<Root.Actions['settings:upsert']>[0] = {
      settingKey,
      settingValue,
      dataType,
    }

    const socket = this._settingsSocketRef.value
    if (!socket) {
      return err(new SocketError('Socket not connected'))
    }

    const emitResult = await emitWithTimeout({
      socket: this._settingsSocketRef,
      actionName: 'settings:upsert',
      payload,
      timeoutMs: socketTimeoutMs.settings,
    })

    if (emitResult.isErr()) {
      return err(new NetworkError('Failed to upsert setting', emitResult.error))
    }

    return ok(undefined)
  }

  public async deleteSetting(settingKey: string) {
    const payload: Parameters<Root.Actions['settings:delete']>[0] = { settingKey }

    const socket = this._settingsSocketRef.value
    if (!socket) {
      return err(new SocketError('Socket not connected'))
    }

    const emitResult = await emitWithTimeout({
      socket: this._settingsSocketRef,
      actionName: 'settings:delete',
      payload,
      timeoutMs: socketTimeoutMs.settings,
    })

    if (emitResult.isErr()) {
      return err(new NetworkError('Failed to delete setting', emitResult.error))
    }

    return ok(undefined)
  }
}
