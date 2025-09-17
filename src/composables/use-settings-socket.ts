import { ref, onBeforeUnmount } from 'vue'

/**
 * VS Code webview API types and safe accessors
 * Docs: https://code.visualstudio.com/api/extension-guides/webview
 */
type VSCodeApi = {
  postMessage: (message: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

declare function acquireVsCodeApi(): VSCodeApi

let _vscodeApi: VSCodeApi | undefined

function getVSCodeApi(): VSCodeApi | undefined {
  if (_vscodeApi) {
    return _vscodeApi
  }

  try {
    if (typeof acquireVsCodeApi === 'function') {
      _vscodeApi = acquireVsCodeApi()
      return _vscodeApi
    }
  } catch {
    // Not in webview
  }

  return undefined
}

export type Setting = {
  settingKey: string
  settingValue: unknown
  dataType: 'string' | 'number' | 'boolean' | 'json'
  settingCategory: string
  required?: boolean
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  description?: string
}

type IncomingMessage =
  | { [k: string]: unknown; type: string }
  | { type: 'settings:list'; settings: unknown }
  | { type: 'settings:updated'; setting: unknown }
  | { type: 'settings:loaded' }
  | { type: 'error'; message: string }

type OutgoingMessage =
  | { type: 'settings:load' }
  | {
      type: 'settings:update'
      payload: {
        key: string
        value: unknown
        dataType: Setting['dataType']
        category: string
      }
    }
  | { type: 'apiKey:set'; payload: { provider: string; apiKey: string } }

function isDataType(x: unknown): x is Setting['dataType'] {
  return x === 'string' || x === 'number' || x === 'boolean' || x === 'json'
}

function isSetting(x: unknown): x is Setting {
  if (!x || typeof x !== 'object') {
    return false
  }

  const o = x as Partial<Record<keyof Setting, unknown>>
  return (
    typeof o.settingKey === 'string' &&
    'settingValue' in o &&
    typeof o.settingCategory === 'string' &&
    isDataType(o.dataType)
  )
}

function isSettingArray(x: unknown): x is Setting[] {
  return Array.isArray(x) && x.every((element) => isSetting(element))
}

export function useSettingsSocket() {
  const vscode = getVSCodeApi()
  const settings = ref<Setting[]>([])

  let resolveListOnce: (() => void) | undefined

  const onMessage = (event: MessageEvent<IncomingMessage>) => {
    const message = event.data
    if (!message || typeof message !== 'object') {
      return
    }

    switch (message.type) {
      case 'settings:list': {
        if (isSettingArray(message.settings)) {
          settings.value = message.settings
        }

        if (resolveListOnce) {
          resolveListOnce()
          resolveListOnce = undefined
        }

        break
      }

      case 'settings:updated': {
        const s = message.setting
        if (isSetting(s)) {
          const index = settings.value.findIndex((x) => x.settingKey === s.settingKey)
          if (index === -1) {
            settings.value = [...settings.value, s]
          } else {
            const copy = [...settings.value]
            copy[index] = s
            settings.value = copy
          }
        }

        break
      }

      case 'settings:loaded': {
        break
      }

      case 'error': {
        console.trace('[useSettingsSocket] host error:', message.message)
        break
      }

      default: {
        break
      }
    }
  }

  window.addEventListener('message', onMessage)

  onBeforeUnmount(() => {
    window.removeEventListener('message', onMessage)
  })

  const loadSettings = async () => {
    await new Promise<void>((resolve) => {
      resolveListOnce = resolve
      vscode?.postMessage({ type: 'settings:load' } satisfies OutgoingMessage)
    })
  }

  const updateSetting = async (
    key: string,
    value: unknown,
    dataType: Setting['dataType'],
    category: string
  ) => {
    vscode?.postMessage({
      type: 'settings:update',
      payload: { key, value, dataType, category },
    } satisfies OutgoingMessage)
  }

  const setApiKey = async (provider: string, apiKey: string) => {
    vscode?.postMessage({
      type: 'apiKey:set',
      payload: { provider, apiKey },
    } satisfies OutgoingMessage)
  }

  return {
    settings,
    loadSettings,
    updateSetting,
    setApiKey,
  }
}
