import { ok, err, type Result } from 'neverthrow'
import type { PromptPresetPOJO } from './types.js'

export class PresetRegistry {
  private _presets = new Map<string, PromptPresetPOJO>()

  register(preset: PromptPresetPOJO): void {
    this._presets.set(preset.presetId, preset)
  }

  load(presets: PromptPresetPOJO[]): void {
    for (const p of presets) this.register(p)
  }

  get(presetId: string): Result<PromptPresetPOJO, Error> {
    const preset = this._presets.get(presetId)
    return preset ? ok(preset) : err(new Error(`Preset "${presetId}" not found`))
  }

  getAll(): PromptPresetPOJO[] {
    return Array.from(this._presets.values())
  }
}
