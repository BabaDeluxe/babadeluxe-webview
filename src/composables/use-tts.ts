import { ref, readonly, computed } from 'vue'
import { KokoroTTSProvider } from '@/tts/kokoro-tts-provider'
import { useSettings } from '@/composables/use-settings'

const currentlyPlayingId = ref<number | null>(null)
const status = ref<'idle' | 'loading' | 'playing'>('idle')

export function useTts() {
  const provider = KokoroTTSProvider.getInstance()
  const { settings, upsertSetting } = useSettings()

  const ttsSpeed = computed(() => {
    const s = settings.value.find(x => x.settingKey === 'tts_speed')
    return s ? (s.settingValue as number) : 1
  })

  const ttsVoice = computed(() => {
    const s = settings.value.find(x => x.settingKey === 'tts_voice')
    return s ? (s.settingValue as string) : 'af_heart'
  })

  const speak = async (messageId: number, text: string) => {
    if (currentlyPlayingId.value === messageId && status.value === 'playing') {
      stop()
      return
    }

    stop()
    currentlyPlayingId.value = messageId
    status.value = provider.isReady() ? 'playing' : 'loading'

    try {
      await provider.speak(text, {
        speed: ttsSpeed.value,
        voice: ttsVoice.value
      })
      status.value = 'playing'
    } catch (error) {
      console.error('TTS failed', error)
      status.value = 'idle'
      currentlyPlayingId.value = null
    }
  }

  const stop = () => {
    provider.stop()
    currentlyPlayingId.value = null
    status.value = 'idle'
  }

  const setSpeed = async (speed: number) => {
    await upsertSetting('tts_speed', speed, 'number')
  }

  const setVoice = async (voice: string) => {
    await upsertSetting('tts_voice', voice, 'string')
  }

  return {
    currentlyPlayingId: readonly(currentlyPlayingId),
    status: readonly(status),
    ttsSpeed,
    ttsVoice,
    speak,
    stop,
    setSpeed,
    setVoice
  }
}
