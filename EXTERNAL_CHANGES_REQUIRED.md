# Required External Changes

The following changes are required in the backend and shared libraries to support the subscription status UI.

## babadeluxe-backend

### Subscription Lifecycle Events
The backend must emit the following event to the subscription socket:

- **Event**: `subscription:updated`
- **Payload**:
  ```typescript
  interface SubscriptionUpdatedPayload {
    tier: string;
    status: string;
    currentPeriodEnd: string; // ISO 8601 string
    cancelAtPeriodEnd: boolean;
  }
  ```

### Customer Portal Session
The backend must handle the following new action on the subscription socket:

- **Action**: `subscription:createPortalSession`
- **Response**:
  ```typescript
  {
    success: boolean;
    portalUrl?: string;
    error?: string;
  }
  ```

## @babadeluxe/shared

### Types for Subscription
The `SubscriptionUpdatedPayload` interface should be moved to `@babadeluxe/shared` for consistency across backend and frontend once the backend implementation is finalized.
