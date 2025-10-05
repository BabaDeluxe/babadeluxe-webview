import { createApp } from 'vue'
import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client'
import { ConsoleLogger } from '@simwai/utils'
import 'virtual:uno.css'
import { createClient } from '@supabase/supabase-js'
import './assets/main.css'
import App from './App.vue'
import router from './routes.js'
import { SocketService } from './socket-service'
import { IocEnum } from './enums/ioc-enum'
import { ApiKeyValidator } from './api-key-validator'
import { validate } from './env-validator'

// Main / Index

// Set up logger
const logger = new ConsoleLogger({ isTimeEnabled: false })

// Log .env files
// @ts-ignore
logger.log(JSON.stringify(import.meta.env))

// Validate .env file
const validationResult = validate()

if (validationResult.isErr()) {
  logger.trace('Wrong .env file config:', validationResult.error)
} else {
  const envConfig = validationResult.value
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = envConfig

  // Mount app
  const app = createApp(App)

  // Provide logger to Vue IoC
  app.provide(IocEnum.LOGGER, logger)

  // Set up the other dependencies
  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
  app.provide(IocEnum.SUPABASE_CLIENT, supabase)

  const apiKeyValidator = new ApiKeyValidator()
  app.provide(IocEnum.API_KEY_VALIDATOR, apiKeyValidator)
  const socketPort = 10_300

  // TODO Io should only be instantiated after the access token was received
  const ioOptions: Partial<ManagerOptions & SocketOptions> = {
    port: socketPort,
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: false,
  }
  // TODO Add access token to server and zod-sockets
  // If (accessToken) {
  //   IoOptions.auth = { token: accessToken }
  // }

  const myIo = io(`http://localhost:${socketPort}`, ioOptions)
  logger.log(`Socket service listens on ${socketPort}`)

  const socketService = new SocketService(logger, myIo)
  app.provide(IocEnum.SOCKET_SERVICE, socketService)

  app.use(router)
  app.mount('#app')
}
