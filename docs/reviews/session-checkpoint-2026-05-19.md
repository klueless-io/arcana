# Session Checkpoint — 2026-05-19

> Load this file at the start of a new session to restore full context.
> Say: "Read docs/reviews/session-checkpoint-2026-05-19.md and pick up from there."

---

## Where we came from

This session resolved a foundational strategic question: **Is Arcana's data shape correct, or did we make a mistake?**

The answer came from a natural experiment: KyberBot (libsql/SQLite) and Kybernesis Brain (Convex) both built memory systems independently. When audited, KyberBot converged on Arcana's shape. Brain's differences turned out to be Convex artifacts (4-flat-ID edges, shadow entity rows, loose enum vocab) — not domain signal. Two genuine domain lessons were absorbed (Memory.status, memory-level supersession). This is documented in **ADR 007: Shape Thesis**.

---

## What was done this session

### ADR 007 — Shape Thesis (3 schema additions, all committed)

| Commit | What |
|---|---|
| `525187f` | `Memory.status: 'active'\|'archived'\|'deleted'` field |
| `6f9b86f` | `Memory.isLatest`, `Memory.supersededBy`, `command.markMemorySuperseded` |
| `7098c77` | `ProfileEntry` schema — `EntityProfile.staticFacts` changed from `string[]` to `ProfileEntry[]` |

### T10 — arcana-provider-libsql (committed `171d7a7`)
- Full `StructuredStore` implementation over libsql synchronous SQLite binding
- All 9 entity types in SQLite tables
- 29 integration tests against `:memory:` SQLite
- **191 tests passing across 23 files**

### Scope rename (committed `1cc016a`)
- npm org is `kybernesis` (not `kybernesisai`) — Ian created it with this name
- All package names changed: `@kybernesisai/arcana-*` → `@kybernesis/arcana-*`
- 40 files updated, bun re-linked, all 191 tests still passing

### Parity analysis (research only — no code changes)
- Deep-dived KyberBot brain, Kybernesis Brain, and kyberagent-desktop
- Cloned kyberagent-desktop to `~/dev/kybernesis/kyberagent-desktop`
- Findings: Arcana has **100% write parity** with KyberBot; **~30% read parity** (hybridSearch, factRetrieval, getEntityProfile all stubbed); sleep pipeline entirely stubbed
- KyberAgent Desktop uses sqlite-vec instead of ChromaDB (no Docker) — not yet Arcana-integrated

### KyberBot integration status
- `initArcana()` wired in production on `arcana-adoption` branch (22 commits, 724 tests)
- `ClaudeLLMProvider` adapter built
- Branch standing by for delivery review + merge

---

## Where we are right now — IN-FLIGHT

### 🔴 Blocked: npm publish (needs your action)

Five packages need publishing. Publish was attempted but requires OTP re-authentication.

**To unblock:**
```bash
npm login   # re-authenticate with OTP
```

**Then publish in this exact order:**
```bash
cd packages/arcana-contracts && npm publish --access public
cd ../arcana-config && npm publish --access public
cd ../arcana-core && npm publish --access public
cd ../arcana-testkit && npm publish --access public
cd ../arcana-provider-libsql && npm publish --access public
```

**After publish confirmed:** Send comms to KyberBot (see below).

---

## Where we are going — next actions

### Arcana side

1. **Complete npm publish** (unblocked by OTP login above)
2. **Send publish confirmation comms** to KyberBot — template:

```
## 2026-05-19 HH:MM  ARCANA → KBOT  NOTE — All 5 packages live on npm

All @kybernesis/* packages are now published at v0.1.0:
- @kybernesis/arcana-contracts
- @kybernesis/arcana-config
- @kybernesis/arcana-core
- @kybernesis/arcana-testkit
- @kybernesis/arcana-provider-libsql

You can now swap file: deps for version pins. Run pnpm install after.
```

3. **sqlite-vec VectorStore provider** (future) — unblocks KyberAgent Desktop adoption
4. **Sleep pipeline steps** (future, demand-driven) — decay and tier steps first

### KyberBot side (separate session at ~/dev/kybernesis/kyberbot)

1. **Rename scope** — find/replace `@kybernesisai/` → `@kybernesis/` on `arcana-adoption` branch (comms already sent)
2. **Delivery review** — modules #5–#15 weren't formally reviewed (use `/appydave:delivery-review`)
3. **Swap file: deps → version pins** — after publish confirmed
4. **Merge arcana-adoption → main**

### KyberAgent Desktop (separate session at ~/dev/kybernesis/kyberagent-desktop)

- No Arcana integration yet — clean-room fork
- Uses sqlite-vec (no Docker) — needs `arcana-provider-sqlite-vec` before adoption makes sense
- Same adoption playbook as KyberBot when ready

### Kybernesis Brain (separate session)

- Should migrate off Convex → SQL (Ian agrees)
- Cognition layer (facts, entities, edges, insights) maps cleanly to Arcana contracts
- Infrastructure layer (auth, connectors, workflows, MCP) stays outside Arcana scope
- Not urgent — KyberBot integration is the priority

---

## Key files and locations

| What | Where |
|---|---|
| Cross-session comms log | `~/dev/kybernesis/.comms/arcana-kyberbot.md` |
| ADR 007 (shape thesis) | `docs/decisions/007-shape-thesis-portable-rules-not-records.md` |
| Mochaccino task progress | `.mochaccino/data/01-task-progress.json` |
| Mochaccino kernel methods | `.mochaccino/data/06-kernel-methods.json` |
| libsql provider | `packages/arcana-provider-libsql/src/libsql-structured-store.ts` |
| KyberBot adoption branch | `~/dev/kybernesis/kyberbot` on `arcana-adoption` |
| KyberAgent Desktop | `~/dev/kybernesis/kyberagent-desktop` (cloned today, no Arcana yet) |

---

## Current test count

**191 tests, 23 files, all passing** (`pnpm test` from repo root)

## npm org

- Org: `kybernesis` on npmjs.com
- David: `klueless-io` (developer role)
- Ian: `ianborders` (owner)
- Packages: not yet published (blocked on OTP)

---

## How to reload this session

Open a new Claude Code session at `~/dev/kybernesis/arcana` and say:

> "Read docs/reviews/session-checkpoint-2026-05-19.md and pick up from there. The immediate priority is completing the npm publish — I need to run `npm login` first then publish 5 packages in order."
