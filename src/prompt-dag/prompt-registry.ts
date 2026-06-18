import { ok, err, type Result } from 'neverthrow'
import type { PromptPartPOJO } from './types.js'

export class PromptRegistry {
  private _parts = new Map<string, PromptPartPOJO>()

  register(part: PromptPartPOJO): void {
    this._parts.set(part.id, part)
  }

  load(parts: PromptPartPOJO[]): void {
    for (const p of parts) this.register(p)
  }

  get(id: string): Result<PromptPartPOJO, Error> {
    const part = this._parts.get(id)
    return part ? ok(part) : err(new Error(`Prompt part "${id}" not found in registry`))
  }

  has(id: string): boolean {
    return this._parts.has(id)
  }
}
