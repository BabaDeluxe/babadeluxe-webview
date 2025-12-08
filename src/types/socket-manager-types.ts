import type {
  Chat,
  Models,
  Prompts,
  Settings,
  Subscription,
  Validation,
} from '@babadeluxe/shared/generated-socket-types'
import type { SocketNamespace } from '@/socket-namespaces'
import type { SocketService } from '@/socket-service'

// Derive the union from the enum (single source of truth)
export type NamespaceName = (typeof SocketNamespace)[keyof typeof SocketNamespace]

// Constrain NamespaceConfig keys to match the enum values
export type NamespaceConfig = {
  [SocketNamespace.CHAT]: { emission: Chat.Emission; actions: Chat.Actions }
  [SocketNamespace.SETTINGS]: { emission: Settings.Emission; actions: Settings.Actions }
  [SocketNamespace.MODELS]: { emission: Models.Emission; actions: Models.Actions }
  [SocketNamespace.PROMPTS]: { emission: Prompts.Emission; actions: Prompts.Actions }
  [SocketNamespace.VALIDATION]: { emission: Validation.Emission; actions: Validation.Actions }
  [SocketNamespace.SUBSCRIPTION]: { emission: Subscription.Emission; actions: Subscription.Actions }
}

export type SocketServiceFor<N extends NamespaceName> = SocketService<
  NamespaceConfig[N]['emission'],
  NamespaceConfig[N]['actions']
>

export type SocketRegistry = {
  [N in NamespaceName]: SocketServiceFor<N>
}
