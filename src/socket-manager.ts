import type {
  Chat,
  Settings,
  Models,
  Prompts,
  Validation,
} from '@babadeluxe/shared/generated-socket-types'
import type { ConsoleLogger } from '@simwai/utils'
import { ResultAsync, type Result } from 'neverthrow'
import type { ManagerOptions, SocketOptions } from 'socket.io-client'
import { io } from 'socket.io-client'
import { SocketService, type SocketConnectionError } from './socket-service'

export class SocketManagerError extends Error {
  constructor(
    message: string,
    public readonly failures: Array<{ namespace: string; error: SocketConnectionError }>
  ) {
    super(message)
    this.name = 'SocketManagerError'
    Object.setPrototypeOf(this, SocketManagerError.prototype)
  }
}

export class SocketManager {
  private _chatSocket: SocketService<Chat.Emission, Chat.Actions>
  private _settingsSocket: SocketService<Settings.Emission, Settings.Actions>
  private _modelsSocket: SocketService<Models.Emission, Models.Actions>
  private _promptsSocket: SocketService<Prompts.Emission, Prompts.Actions>
  private _validationSocket: SocketService<Validation.Emission, Validation.Actions>

  constructor(
    private readonly _logger: ConsoleLogger,
    private readonly _baseUrl: string,
    private readonly _authToken: string
  ) {
    const ioOptions: Partial<ManagerOptions & SocketOptions> = {
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
      auth: { token: _authToken },
    }

    this._chatSocket = new SocketService(_logger, io(`${_baseUrl}/chat`, ioOptions), 'chat')
    this._settingsSocket = new SocketService(
      _logger,
      io(`${_baseUrl}/settings`, ioOptions),
      'settings'
    )
    this._modelsSocket = new SocketService(_logger, io(`${_baseUrl}/models`, ioOptions), 'models')
    this._promptsSocket = new SocketService(
      _logger,
      io(`${_baseUrl}/prompts`, ioOptions),
      'prompts'
    )
    this._validationSocket = new SocketService(
      _logger,
      io(`${_baseUrl}/validation`, ioOptions),
      'validation'
    )
  }

  async init(): Promise<Result<void, SocketManagerError>> {
    this._logger.log(`🔌 Connecting to socket namespaces at ${this._baseUrl}`)

    const [chatResult, settingsResult, modelsResult, promptsResult, validationResult] =
      await Promise.all([
        this._chatSocket.init(),
        this._settingsSocket.init(),
        this._modelsSocket.init(),
        this._promptsSocket.init(),
        this._validationSocket.init(),
      ])

    const failures: Array<{ namespace: string; error: SocketConnectionError }> = []

    chatResult.match(
      () => this._logger.log('Chat socket connected'),
      (error) => {
        this._logger.error('❌ Chat socket failed:', error)
        failures.push({ namespace: 'chat', error })
      }
    )

    settingsResult.match(
      () => this._logger.log('Settings socket connected'),
      (error) => {
        this._logger.error('❌ Settings socket failed:', error)
        failures.push({ namespace: 'settings', error })
      }
    )

    modelsResult.match(
      () => this._logger.log('Models socket connected'),
      (error) => {
        this._logger.error('❌ Models socket failed:', error)
        failures.push({ namespace: 'models', error })
      }
    )

    promptsResult.match(
      () => this._logger.log('Prompts socket connected'),
      (error) => {
        this._logger.error('❌ Prompts socket failed:', error)
        failures.push({ namespace: 'prompts', error })
      }
    )

    validationResult.match(
      () => this._logger.log('Validation socket connected'),
      (error) => {
        this._logger.error('❌ Validation socket failed:', error)
        failures.push({ namespace: 'validation', error })
      }
    )

    if (failures.length > 0) {
      return ResultAsync.fromSafePromise(
        Promise.reject(
          new SocketManagerError(`Failed to connect ${failures.length} namespace(s)`, failures)
        )
      )
    }

    return ResultAsync.fromSafePromise(Promise.resolve())
  }

  disconnect(): void {
    this._chatSocket.disconnect()
    this._settingsSocket.disconnect()
    this._modelsSocket.disconnect()
    this._promptsSocket.disconnect()
    this._validationSocket.disconnect()
    this._logger.log('🧹 All socket namespaces disconnected')
  }

  get chatSocket(): SocketService<Chat.Emission, Chat.Actions> {
    return this._chatSocket
  }

  get settingsSocket(): SocketService<Settings.Emission, Settings.Actions> {
    return this._settingsSocket
  }

  get modelsSocket(): SocketService<Models.Emission, Models.Actions> {
    return this._modelsSocket
  }

  get promptsSocket(): SocketService<Prompts.Emission, Prompts.Actions> {
    return this._promptsSocket
  }

  get validationSocket(): SocketService<Validation.Emission, Validation.Actions> {
    return this._validationSocket
  }
}
