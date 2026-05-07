# Code & Architecture Review — betting-backend

---

## Critical Security Issues

### 1. `userId` taken from request body in `POST /bets`

`BetController.createBet` passes `createBetDto` straight through to the service, and `CreateBetDto` has a public `userId` field. Any authenticated user can therefore bet on behalf of any other user — draining their balance.

```ts
// bet.controller.ts
async createBet(@Body() createBetDto: CreateBetDto) {
  return this.betService.create(createBetDto); // userId comes from client, not JWT
}
```

**Fix:** Remove `userId` from `CreateBetDto`, inject `@Request() req`, and pass `req.user.id` to the service.

---

### 2. Two different JWT fallback secrets — tokens will be invalid if `JWT_SECRET` is unset

`auth.module.ts` falls back to `'default-secret-change-in-production'` while `jwt.strategy.ts` falls back to `'your-secret-key-change-in-production'`. If `JWT_SECRET` is missing from the environment, the app **signs** with one string and **verifies** with another — every token will be rejected with 401 and the root cause will be nearly impossible to spot.

```ts
// auth.module.ts  — one fallback
secret: process.env.JWT_SECRET ?? 'default-secret-change-in-production',

// jwt.strategy.ts — different fallback
secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
```

**Fix:** Use a single constant/config value, and throw on startup if `JWT_SECRET` is absent.

---

### 3. WebSocket gateway has no authentication

`ReportsGateway` accepts every WebSocket connection without verifying a JWT. `cors: { origin: '*' }` makes this reachable from anywhere. Any external client that guesses a job ID can subscribe to its status stream.

```ts
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/reports' })
export class ReportsGateway implements OnGatewayConnection { ... }
// handleConnection does not check any token
```

**Fix:** Validate the `Authorization` header (or a `token` query param) inside `handleConnection` and disconnect unauthenticated sockets.

---

### 4. Password reset token uses `Math.random()`

`Math.random()` is not cryptographically secure and is predictable with sufficient observations.

```ts
const resetToken =
  Math.random().toString(36).substring(2) + Date.now().toString(36);
```

**Fix:** Use `crypto.randomBytes(32).toString('hex')` (Node built-in).

---

### 5. CORS is fully open

`app.enableCors()` with no arguments allows any origin. For a financial API this is unacceptable in production.

**Fix:** Pass an explicit `origin` allowlist from environment config.

---

## Race Condition / Financial Integrity

### 6. TOCTOU race condition in `BetService.create`

The balance check and the balance update are not atomic. The user's balance is read **outside** the transaction; by the time the update runs, another concurrent request may have already spent those funds.

```ts
// Balance is read here — OUTSIDE the transaction
const user = await this.prisma.user.findUnique(...);
if (user.balance < createBetDto.amount) throw ...;

return this.prisma.$transaction(async (tx) => {
  await tx.user.update({
    data: { balance: user.balance - createBetDto.amount }, // stale value
  });
});
```

Under concurrent requests a user could place more bets than their balance allows.

**Fix:** Move everything inside the transaction, use `{ decrement: amount }`, and add a database-level CHECK constraint `balance >= 0` so the DB rejects the update if the balance would go negative.

---

### 7. `balance` stored as `Float` — floating-point money

Prisma `Float` maps to PostgreSQL `DOUBLE PRECISION`. Floating-point arithmetic is imprecise and will introduce subtle rounding errors in payouts and balance calculations over time (e.g., `100 * 1.9 = 189.99999...`).

**Fix:** Change `balance` and `amount`/`payout` to `Decimal` in the Prisma schema (maps to PostgreSQL `NUMERIC`). Prisma exposes these as `Decimal` objects; use `.toFixed(2)` for display.

---

## Logic Bugs

### 8. `UpdateMatchDto` allows setting `status: 'DELETED'` via PATCH

`Status.DELETED` is part of the Prisma enum and `UpdateMatchDto` validates with `@IsEnum(Status)`. This means `PATCH /matches/:id` with `{ "status": "DELETED" }` will soft-delete a match **without** triggering the refund logic in `MatchService.delete`.

**Fix:** Either exclude `DELETED` from the DTO's allowed values, or always route DELETED state through the dedicated delete path.

---

### 9. `playerCount` is wrong in the aggregated stats report

`uniqueUsers` is a global `Set` shared across all sports. After the loop, every sport row gets `uniqueUsers.size` — the total unique users across **all** sports — not the unique users per sport.

```ts
for (const stats of sportMap.values()) {
  stats.playerCount = uniqueUsers.size; // same global count for every sport
}
```

**Fix:** Track a per-sport `Set<number>` inside `sportMap` entries.

---

### 10. Match `update` passes raw DTO directly to Prisma

```ts
return this.prisma.match.update({ where: { id }, data: updateMatchDto });
```

If `UpdateMatchDto` is ever extended with a field whose name matches a schema column (e.g., `id`, `createdAt`, `bets`), it will silently overwrite data. Even today, a client can set `status: 'IN_PROGRESS'` and pass a `winner` simultaneously, which the service ignores for the payout branch — but stores both in a normal update.

**Fix:** Explicitly whitelist which fields are written: `data: { status: updateMatchDto.status, winner: updateMatchDto.winner }`.

---

## Architecture Issues

### 11. `BullModule.forRoot` is configured inside `ReportsModule`

BullMQ's root connection config belongs in `AppModule` (or a dedicated `QueueModule`). Placing it inside a feature module means it cannot easily be shared if a second module ever needs a queue, and the Redis connection config is invisible at the app level.

---

### 12. CSV report stored in Redis job `returnvalue`

The full CSV string is returned as the job result and stored in Redis. For large date ranges (thousands of bets), this can be several MB per job. Redis memory will grow unboundedly if completed jobs are never cleaned up, and the BullMQ `removeOnComplete` option is not configured.

**Fix:** Write the CSV to disk (or object storage) and store only the file path in `returnvalue`. Configure `removeOnComplete: { age: 86400 }` and `removeOnFailed: { count: 100 }` on queue registration.

---

### 13. `replenish` has no upper-bound validation

Any authenticated user can add an arbitrary amount to their own balance (e.g., 1 000 000 000). There is no business-rule cap.

**Fix:** Add `@Max(10000)` (or whatever the business rule is) to `ReplenishDto.amount`.

---

## Code Quality

### 14. `noImplicitAny: false` and other weakened TypeScript checks

`tsconfig.json` disables `noImplicitAny`, `strictBindCallApply`, and `noFallthroughCasesInSwitch`. This makes the type system significantly less reliable. Several places in the codebase use `any` (e.g., `emitStatusUpdate(jobId: string, status: string, data?: any)`).

**Fix:** Enable `strict: true` and fix the resulting errors. At minimum, replace `data?: any` with a proper discriminated union type.

---

### 15. Email send errors are silently swallowed

```ts
try {
  await this.resend.emails.send(...);
} catch (error) {
  console.error('Failed to send email:', error); // caller never knows
}
```

If email sending fails, `forgotPassword` returns a success-looking response and the user never receives their reset link. There is no alerting, no retry, and no way to detect the failure.

**Fix:** Either rethrow the error (with a user-friendly message) or at minimum record the failure in a structured way and consider a BullMQ retry queue for transient email failures.

---

### 16. `match.status` compared as string literal in `BetService`

```ts
if (match.status !== 'PENDING') { // string literal, not Status.PENDING
```

`Status` is already imported from `@prisma/client` in other files. String literals bypass compile-time enum safety.

**Fix:** `import { Status } from '@prisma/client'` and use `Status.PENDING`.

---

### 17. `@prisma/pg-worker` is an unused production dependency

`package.json` lists `@prisma/pg-worker` in `dependencies`, but it is not imported anywhere in the source. `PrismaService` uses `@prisma/adapter-pg` + `pg`. This adds unnecessary bundle weight and a potential supply-chain surface.

---

## DevOps / Deployment

### 18. `prisma.config.ts` is copied to the production server but is only needed by the Prisma CLI

`prisma.config.ts` is a development/CLI config file. The production runtime (`node dist/main.js`) does not need it. The CI deploy script copies it anyway, which is harmless but introduces a TypeScript file that needs `ts-node` or equivalent to run on the server — and it is referenced in `ecosystem.config.cjs` indirectly via `prisma migrate deploy` which uses `prisma.config.ts`.

Consider compiling or dropping it from the deploy artifact.

---

### 19. No structured logging

The application uses `console.error` for email failures and `Logger` from NestJS only in the WebSocket gateway. There is no structured logger (e.g., Pino) configured globally, making log aggregation and filtering difficult in production.
