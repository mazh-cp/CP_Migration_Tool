# Map Policy — research summary and enhancement plan

**Status:** Planning  
**Scope:** `apps/web/.../map/policy`, rule/NAT mapping persistence, validation, export

---

## 1. Current architecture (research)

### Data model

| Store | Contents | Used by |
|-------|----------|---------|
| `normalizedData.rulesJson` | `NormalizedPolicyRule[]` — canonical `sourceRefs`, `destinationRefs`, `serviceRefs`, `action`, `log`, `enabled`, `comments`, Forti-specific hints | `POST /api/.../validate` (`validate()` from `@cisco2cp/core`), `fix-missing-ref`, parse job |
| `mappingDecisionRecord` (`entityType: 'rule'`) | `proposedTarget` as `CheckPointRule` — `source`/`destination`/`service` are **the same object IDs** as normalized refs today | Map Policy UI, `mapping/override`, export (`exportToJson` → CSV/CLI) |

`mapPolicy()` in `packages/core/src/mapping/mapPolicy.ts` builds rule decisions **directly from** `NormalizedPolicyRule` fields (IDs + mapped `action`/`track`).

### Export

`packages/exporters/src/checkpoint/export-json.ts` resolves `source`/`destination`/`service` IDs through names from `normalized.objects` plus Any aliases. It does **not** re-read `normalized.rules` for membership.

### Validation

`packages/core/src/validate/index.ts` → `validateMissingRefs` walks **`data.rules`** (normalized), not mapping rows. Any change that only updates `mappingDecisionRecord` for a rule **without** updating `rulesJson` will **not** fix MISSING_REF and can **desync** “what validate shows” vs “what exports”.

### Existing server pattern for consistency

`apps/web/src/app/api/projects/[projectId]/fix-missing-ref/route.ts` mutates `rules[]`, then for touched rules calls `mapPolicy(rules)` and **upserts** `mappingDecisionRecord` so mapping stays aligned with normalized.

### Parse / re-parse

`apps/web/src/lib/parse-job.ts` **deletes all** `mappingDecisionRecord` for the project and recreates them from a fresh `mapPolicy(normalized.rules)`. User overrides on rules are **lost** on full re-parse (expected today).

### UI today

`map/policy/page.tsx`: access rules — **rename only** (`CheckPointRule.name`); NAT — **comments only**. `POST .../mapping/override` already accepts arbitrary `proposedTarget` (Zod `z.record(z.unknown())`); the limitation is **frontend scope**, not API shape.

---

## 2. Goals (enhanced functionality)

1. Let operators adjust **export-relevant** access-rule fields without re-importing source config.
2. Keep **validate**, **fix-missing-ref**, and **export** consistent (single logical source of truth for refs).
3. Prefer **incremental** delivery: ship low-risk edits first, then membership editing with clear UX.

---

## 3. Design principle

**Rule membership (`source` / `destination` / `service` IDs) should be edited by updating `normalizedData.rulesJson` and then refreshing the rule’s `mappingDecisionRecord` (same pattern as `fix-missing-ref`).**

**Pure Check Point presentation fields** that do not exist on `NormalizedPolicyRule` as separate CP-only fields today are still only in `CheckPointRule` — but `action`/`track`/`enabled`/`comments` **do** have normalized counterparts (`action`, `log`, `enabled`, `comments`). To avoid permanent drift:

- Either update **both** normalized rule + mapping in one API transaction, **or**
- Update normalized only and **derive** mapping via `mapRule()` for that rule.

Recommended: **one API** `PATCH /api/projects/[projectId]/rule` (or split `patch-rule-metadata` / `patch-rule-refs`) that:

1. Loads `normalizedData`.
2. Finds rule by `id` (`sourceId` on mapping === `NormalizedPolicyRule.id`).
3. Applies validated patch to the rule object.
4. Persists `rulesJson` (and optionally bumps `migrationReportJson` via `buildMigrationReport` like `fix-missing-ref`).
5. Recomputes **only** that rule’s `MappingDecision` with `mapPolicy([updatedRule])` or extract `mapRule` to avoid re-scoring unrelated rules — simplest is `mapPolicy(rules)` and upsert the one `sourceId` (cheap for typical rule counts).
6. Returns updated mapping row + validation snapshot optional.

Map Policy UI then calls this API instead of (or in addition to) raw `mapping/override` for fields that affect normalized data.

---

## 4. Phased plan

### Phase A — Access rule: metadata without ref changes (low risk)

**Status:** Implemented — `POST /api/projects/[projectId]/patch-rule` updates `rulesJson`, recomputes the rule’s mapping via `mapPolicy`, refreshes `migrationReportJson`; Map Policy modal edits name, action, track, enabled, comment.

**Fields:** `action` (normalized `allow|deny|reject` ↔ CP `accept|drop|reject`), `log` (`none|log|alert` ↔ `track`), `enabled`, `comments`, **and** CP `name` (already supported via override).

**Implementation:** New route (recommended) or extend `mapping/override` with a `syncNormalized: true` flag that:

- Updates the corresponding entry in `rulesJson`.
- Re-runs `mapRule` / `mapPolicy` for that rule and upserts DB.

**UI:** Expand modal to toggles/dropdowns for action, track, enabled, comments + name; show Forti warnings as read-only.

**Tests:** API unit/integration: patch → validate() has no new MISSING_REF; export bundle reflects new action/track/enabled/comment.

### Phase B — Access rule: membership (`source` / `destination` / `service`)

**UI:** Multi-select or searchable pickers listing **normalized object IDs** with display names (reuse patterns from `map/objects` name resolution + `normalized` GET).

**Server:** Same `patch-rule` route accepting arrays of object IDs; validate each ID exists in `objectsJson` or is `ANY_*` constant from core.

**Edge cases:** Duplicates, empty arrays (today warns “any source or destination” — decide if UI allows explicit Any vs empty).

**Performance:** Large policies — batch upsert is already used elsewhere; single-rule upsert is fine.

### Phase C — NAT beyond comments (medium / model-dependent)

**Today:** `CheckPointNatRule` uses string placeholders for original/translated in UI table; normalized `NormalizedNATRule` uses optional string fields (`originalSrc`, etc.). Clarify whether edits should update **`natJson`** + remap with `mapNat`, or only mapping (again: prefer **normalized + remap** for validate/export alignment).

**Deliverable:** Inventory exact NAT field mapping in `mapNat.ts` and SmartConsole NAT CSV; then mirror the `fix-missing-ref` pattern for NAT rows.

### Phase D — Optional UX / product

- **Reorder rules:** would require `order` on normalized rules + export ordering — larger schema/product change; defer unless required.
- **Duplicate / disable rule:** insert new normalized rule or flip `enabled` (Phase A covers disable).
- **Preserve overrides on selective re-parse:** not in scope here; would need merge strategy when parse job runs.

---

## 5. Testing checklist (cross-cutting)

- [ ] Validate page after rule patch (MISSING_REF unchanged or improved).
- [ ] Export JSON + SmartConsole CSV row for edited rule.
- [ ] `fix-missing-ref` still works on same project after manual edits.
- [ ] Permission: `requireProjectAccess(projectId, true)` for mutating routes (match `mapping/override`).

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Normalized vs mapping drift | Single server path updates both |
| `mapPolicy` regenerates new `MappingDecision.id` | Upsert key is `projectId + entityType + sourceId`; stable `sourceId` is rule `id` |
| Forti-only fields (UTM, interfaces) | Keep read-only in UI; show warnings from mapping row |

---

## 7. File touch list (when implementing)

| Area | Files (expected) |
|------|-------------------|
| API | New `apps/web/src/app/api/projects/[projectId]/patch-rule/route.ts` (or similar) |
| Core (optional) | Export `mapRule` from `mapPolicy.ts` for single-rule recompute without copying private function |
| UI | `apps/web/src/app/(app)/projects/[projectId]/map/policy/page.tsx` |
| Docs | `USER_GUIDE.md` / `docs/user-guide.md` — document editable fields |

---

## 8. Summary

The app **already supports** rich `CheckPointRule` and generic `mapping/override`. The Map Policy page is intentionally minimal. Enhancing functionality safely means **treating normalized rules as canonical for refs and semantics**, updating **`rulesJson` alongside mapping**, and reusing the **`fix-missing-ref` + `mapPolicy` pattern** so validate, export, and UI stay aligned.
