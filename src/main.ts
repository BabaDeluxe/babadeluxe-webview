import { createApp } from 'vue'
import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client'
import { ConsoleLogger } from '@simwai/utils'
import 'virtual:uno.css'
import './assets/main.css'
import App from './App.vue'
import router from './routes.js'
import { SocketService } from './socket-service'
import { initSupabase } from './supabase-client'
import { IocEnum } from './enums/ioc-enum'
import { ApiKeyValidator } from './api-key-validator'

const app = createApp(App)
const logger = new ConsoleLogger({ isTimeEnabled: false })
app.provide(IocEnum.LOGGER, logger)

export const supabase = initSupabase()
app.provide(IocEnum.SUPABASE_CLIENT, supabase)

const {
  data: { session },
} = await supabase.auth.getSession()
if (session) {
  const accessToken = session.access_token
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
  if (accessToken) {
    ioOptions.auth = { token: accessToken }
  }

  const myIo = io(`http://localhost:${socketPort}`, ioOptions)
  logger.log(`Socket service listens on ${socketPort}`)

  const socketService = new SocketService(logger, myIo)
  app.provide(IocEnum.SOCKET_SERVICE, socketService)

  app.use(router)
  app.mount('#app')
} else {
  logger.error('Failed to load the Supabase auth 1session on startup')
}
