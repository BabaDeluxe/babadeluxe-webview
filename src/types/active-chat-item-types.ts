export type ActiveChatItemEmitter = {
  delete: [id: number]
  update: [id: number, content: string]
  rewrite: [id: number, model: string]
}
