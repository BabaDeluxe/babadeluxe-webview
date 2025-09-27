import { createApp } from 'vue'
import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client'
import { ConsoleLogger } from '@simwai/utils'
import './assets/main.css'
import App from './App.vue'
import router from './routes.js'
import { SocketService } from './socket-service'
import { initSupabase } from './supabase-client'
import { IocEnum } from './enums/ioc-enum'
import { AccessTokenRetriever } from './access-token-retriever'

const app = createApp(App)
const logger = new ConsoleLogger({ isTimeEnabled: false })
app.provide(IocEnum.LOGGER, logger)

export const supabase = initSupabase()
app.provide(IocEnum.SUPABASE_CLIENT, supabase)

const accessTokenRetriever: AccessTokenRetriever = new AccessTokenRetriever(supabase)
const accessToken = await accessTokenRetriever.getAccessToken()
const socketPort = 10300

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
