# Statsig Setup — `message_limit_upsell_v1`

## 1. Create a Statsig account

1. Go to [console.statsig.com](https://console.statsig.com)
2. Create a project called **BabaDeluxe**
3. Copy your **Client SDK Key** (starts with `client-`) → add to `.env`:
   ```
   VITE_STATSIG_CLIENT_KEY=client-xxxxxxxxxxxx
   ```

---

## 2. Create the Experiment

In the Statsig console:

1. **Experiments** → **Create Experiment**
2. Set:
   - **Name:** `message_limit_upsell_v1`
   - **ID Type:** `userID`
   - **Allocation:** 100%
   - **Description:** A/B test comparing 10 upsell copy variants shown when the daily free message limit is reached. Measures which variant drives the most Pro upgrades.

---

## 3. Add the Parameter

Inside the experiment, under **Parameters**:

| Parameter name | Type   | Default value |
|----------------|--------|---------------|
| `upsell_copy`  | String | `You've used all 10 free messages today. Unlock unlimited →` |

---

## 4. Create 10 Variants (Groups)

Create **10 groups**, each with **10% allocation**:

| Group | `upsell_copy` value |
|-------|---------------------|
| `control` | `You've used all 10 free messages today. Unlock unlimited →` |
| `variant_b` | `Daily limit reached. Go Pro for unlimited messages.` |
| `variant_c` | `You're on fire! 10/10 messages used. Keep going with Pro.` |
| `variant_d` | `Need more? Upgrade and never hit a limit again.` |
| `variant_e` | `You've hit your daily cap. Pro removes all limits — forever.` |
| `variant_f` | `10 messages used today. Pro users never stop.` |
| `variant_g` | `Your free messages are up. Upgrade and own the conversation.` |
| `variant_h` | `Daily quota reached. Join Pro for unlimited access.` |
| `variant_i` | `That's 10 messages. Pro members never pause.` |
| `variant_j` | `Limit reached. Upgrade to Pro — it takes 30 seconds.` |

---

## 5. Add Metrics

Under **Metrics** in the experiment:

### Primary metric (what we're optimizing)
| Metric name | Event name | Type |
|---|---|---|
| Pro Subscription Started | `pro_subscription_started` | Count |

### Secondary metrics (funnel visibility)
| Metric name | Event name | Type |
|---|---|---|
| Daily Limit Hit | `daily_limit_hit` | Count |
| Gate Shown | `message_limit_gate_shown` | Count |
| Nudge Shown | `nudge_shown` | Count |
| Upgrade Clicked | `upgrade_clicked` | Count |

To create each metric:
1. **Metrics** → **Create Metric**
2. **Event-based** → paste the event name above
3. Type: **Count** for all of them

---

## 6. Start the Experiment

1. Click **Save** on the experiment
2. Click **Start Experiment**
3. Statsig will now assign each user to a group deterministically on first `initializeAsync()` call

---

## 7. How events flow

```
User sends first message of the day
  → nudge_shown (with variant)
  → DailyNudgeToast appears for ~5 seconds

User sends 10th message
  → daily_limit_hit (with variant)
  → MessageLimitGate appears, blocks further sends

User clicks upgrade CTA
  → upgrade_clicked (with variant + source: 'gate' | 'nudge')

After successful payment
  → call limitStore.onUpgradeSuccess()
  → logs pro_subscription_started (primary conversion metric)
```

> ⚠️ You must call `limitStore.onUpgradeSuccess()` from your post-payment success
> callback/webhook redirect page for the primary metric to register.

---

## 8. Reading results

- Go to **Experiments** → `message_limit_upsell_v1` → **Results**
- Statsig computes **lift** on `pro_subscription_started` vs control for each variant
- Wait for **statistical significance** (Statsig shows p-value and confidence intervals automatically)
- Typical runtime needed: **7–14 days** minimum for enough conversion data

---

## 9. After the experiment

1. **Ship the winner:** Click **Make Decision** → select winning variant → Statsig locks everyone to that copy
2. **Hardcode the winner** in `src/lib/statsig.ts` `VARIANTS[0]` and remove the experiment from the dashboard
3. **Archive** `message_limit_upsell_v1` in Statsig
