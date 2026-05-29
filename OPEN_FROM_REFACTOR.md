# Open Issues from Refactor

This file tracks logical or architectural bugs identified during the codebase refactoring process.

| File | Issue | Severity |
|------|-------|----------|
| `use-conversation-store.ts` | Potential race condition in `createConversation` if multiple calls are made simultaneously; partially mitigated by `creationPromise`. | Low |
| `use-chat.ts` | Large amount of reactive state synchronization between different domains (context, messages, models). | Medium |
| `SyncManager.ts` | Conflict resolution logic is basic and might lead to data loss in complex multi-device scenarios. | Medium |
