import { ok, err, type Result } from 'neverthrow'
import type { PromptPresetPOJO } from './types.js'

export class PresetRegistry {
  private presets = new Map<string, PromptPresetPOJO>()

  register(preset: PromptPresetPOJO): void {
    this.presets.set(preset.presetId, preset)
  }

  load(presets: PromptPresetPOJO[]): void {
    for (const p of presets) this.register(p)
  }

  get(presetId: string): Result<PromptPresetPOJO, Error> {
    const preset = this.presets.get(presetId)
    return preset
      ? ok(preset)
      : err(new Error(`Preset "${presetId}" not found`))
  }

  has(presetId: string): boolean {
    return this.presets.has(presetId)
  }

  getAll(): PromptPresetPOJO[] {
    return Array.from(this.presets.values())
  }
}
