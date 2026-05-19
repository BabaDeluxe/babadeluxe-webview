import { v4 as uuidv4 } from 'uuid'

const key = 'babadeluxe:deviceId'

export class DeviceIdService {
  getOrCreate(): string {
    let id = localStorage.getItem(key)
    if (!id) {
      id = uuidv4()
      localStorage.setItem(key, id)
    }
    return id
  }

  static get(): string {
    let id = localStorage.getItem(key)
    if (!id) {
      id = uuidv4()
      localStorage.setItem(key, id)
    }
    return id
  }
}
