# Plan Formatter – Canonical Schema

This document defines the **canonical JSON structure** for all plans produced by auditors and consumed by validators and orchestrators.

It is the single source of truth for:

- the shape of a plan
- required and optional fields
- allowed values
- structural and semantic constraints

All auditors MUST emit plans that conform to this specification.  
All validators MUST validate plans against this specification before considering semantics or feasibility.

---

## Canonical Plan JSON Shape

A plan is a single JSON object with a single top-level key:

```json
{
  "plan": [
    {
      "action": "string (required)",
      "why": "string (required, evidence-based)",
      "filesInvolved": ["string", "string"],
      "risk": "LOW",
      "category": "complexity",
      "notes": "optional free text"
    }
  ]
}
```

### Top-Level Object

- The top-level MUST be a JSON object.
- It MUST contain exactly one key: `"plan"`.
- `"plan"` MUST be an array.

### Plan Items

Each item in the `"plan"` array MUST be a JSON object with the following fields:

- `action` (string, **required**)  
  - A concise, imperative description of the change to perform.  
  - Must be concrete and actionable, not a vague goal.  
  - Examples:  
    - `"Rename UserService method getUser to findUserById"`  
    - `"Extract shared validation helper for tenantId parsing"`  

- `why` (string, **required**)  
  - Evidence-based justification for the action.  
  - Should reference observed problems, files, or patterns—not hypothetical benefits.  
  - Examples:  
    - `"Reduces duplication across user.controller.ts and user.service.ts"`  
    - `"Aligns with existing naming pattern in user.repository.ts"`  

- `filesInvolved` (array of strings, **required; may be empty only when no files are applicable**)  
  - Each element is a string representing a file path or glob-like identifier.  
  - Prefer concrete paths when known (e.g., `"apps/api/src/user/user.service.ts"`).  
  - When planning a conceptual step that spans many files, the auditor may use higher-level descriptors (e.g., `"all user-related controller files"`), but SHOULD prefer explicit paths whenever possible.

- `risk` (string, **optional but recommended**)  
  - Allowed values: `"LOW"`, `"MEDIUM"`, `"HIGH"`.  
  - Defaults to `"LOW"` when omitted (validators MAY enforce explicit risk if desired).  
  - Represents the likelihood and impact of regressions if the plan is executed.

- `category` (string, **required**)  
  - Allowed values (exact strings):  
    - `"complexity"`  
    - `"consistency"`  
    - `"security"`  
    - `"dependency"`  
    - `"documentation"`  
    - `"modularity"`  
    - `"performance"`  
    - `"quality"`  
    - `"reliability"`  
  - The category MUST match the originating auditor’s concern domain.

- `notes` (string, **optional**)  
  - Free-form additional context.  
  - May be empty or omitted entirely.  

No other fields are allowed on a plan item.

---

## Structural Constraints

These rules apply to the overall structure of a plan:

- Top-level:
  - MUST be a JSON object with a `plan` key only.
- `plan`:
  - MUST be an array.
  - MUST contain at least 1 item.
  - MUST contain **no more than 3 items**.
- Plan items:
  - MUST NOT contain nested objects or arrays beyond `filesInvolved`.  
    - i.e., `action`, `why`, `risk`, `category`, `notes` are all plain strings.  
    - `filesInvolved` is the only array field.
  - MUST NOT contain tool-specific or orchestrator-specific fields (no IDs, tags, or metadata keys beyond the schema).
  - MUST NOT include unknown/extra keys.

---

## Field Semantics

To keep auditors and validators aligned, the following semantics are enforced:

- `action`  
  - Describes *what will be done*.  
  - Should be short but precise.  
  - Must avoid ambiguous verbs like “improve”, “fix things”, “refactor code” without stating *what exactly* changes.

- `why`  
  - Describes *why* the action is needed.  
  - Should reference specific issues (e.g., duplication, inconsistent naming, security risk, missing tests) and, when possible, concrete evidence (file paths, patterns, or invariants).  
  - Should not be purely aspirational (e.g., “to make it better”) or speculative (“might help performance”).

- `filesInvolved`  
  - Indicates which files or areas of the codebase are directly impacted.  
  - Should be as concrete as the available evidence allows.  
  - MAY be an empty array only when the action is intentionally non-code or meta (e.g., “Document current tenant isolation rules in README.md” would still typically reference a file).
  - Validators MAY reject plans where file references are clearly expected but missing.

- `risk`  
  - Indicates the change’s risk level, not its importance.  
  - `"LOW"`: behavior-preserving, localized, easy to reason about.  
  - `"MEDIUM"`: moderate blast radius, touching shared components or flows.  
  - `"HIGH"`: affects critical flows, security boundaries, or widely used abstractions.

- `category`  
  - Provides routing information for validators and orchestrators.  
  - MUST match the auditor’s role (e.g., Complexity Auditor → `"complexity"`).

- `notes`  
  - Used for clarifications that do not fit into `action` or `why`.  
  - Optional; auditors SHOULD keep it concise.

---

## Examples

### Minimal Valid Plan (Single Item)

```json
{
  "plan": [
    {
      "action": "Extract shared tenantId parsing helper",
      "why": "Tenant parsing logic is duplicated in user.controller.ts and org.controller.ts, increasing complexity and drift risk.",
      "filesInvolved": [
        "apps/api/src/user/user.controller.ts",
        "apps/api/src/organization/organization.controller.ts"
      ],
      "risk": "LOW",
      "category": "complexity",
      "notes": "Behavior-preserving refactor; no API changes."
    }
  ]
}
```

### Valid Multi-Item Plan

```json
{
  "plan": [
    {
      "action": "Align permission string naming for organization management",
      "why": "Permissions use both organization:* and organizations:* patterns, causing confusion and inconsistent checks.",
      "filesInvolved": [
        "libs/rbac/src/permissions.ts",
        "apps/admin/src/organization/organization.service.ts"
      ],
      "risk": "MEDIUM",
      "category": "consistency",
      "notes": "Requires updating tests and any permission lookups using the older names."
    },
    {
      "action": "Add missing tests for cross-tenant access denial on organization listing",
      "why": "organization.service.listForTenant has no explicit tests for cross-tenant access attempts.",
      "filesInvolved": [
        "apps/api/test/organization/organization.service.spec.ts"
      ],
      "risk": "LOW",
      "category": "quality",
      "notes": "New test cases only; implementation stays unchanged."
    }
  ]
}
```

### Invalid Plans (Conceptual)

The following examples are **invalid** and SHOULD be rejected by validators:

1. Missing required fields:

```json
{
  "plan": [
    {
      "action": "Refactor auth module"
      // missing "why", "filesInvolved", "category"
    }
  ]
}
```

2. Unknown fields:

```json
{
  "plan": [
    {
      "action": "Rename field",
      "why": "Inconsistent with other DTOs",
      "filesInvolved": ["apps/api/src/user/user.dto.ts"],
      "risk": "LOW",
      "category": "consistency",
      "extra": "not allowed"
    }
  ]
}
```

3. Too many items:

```json
{
  "plan": [
    { "action": "A", "why": "X", "filesInvolved": [], "risk": "LOW", "category": "complexity" },
    { "action": "B", "why": "Y", "filesInvolved": [], "risk": "LOW", "category": "complexity" },
    { "action": "C", "why": "Z", "filesInvolved": [], "risk": "LOW", "category": "complexity" },
    { "action": "D", "why": "W", "filesInvolved": [], "risk": "LOW", "category": "complexity" }
  ]
}
```

4. Ambiguous `action` / `why`:

```json
{
  "plan": [
    {
      "action": "Improve the design",
      "why": "To make it better",
      "filesInvolved": [],
      "risk": "MEDIUM",
      "category": "complexity"
    }
  ]
}
```

---

## Usage by Auditors and Validators

- **Auditors**  
  - When asked to produce a plan, MUST emit a single JSON object exactly matching this schema.  
  - MUST NOT include explanations, markdown, or commentary outside the JSON object when producing the plan.

- **Structure Validator** (`validators/structure.md`)  
  - MUST validate JSON shape, required fields, allowed values, and length constraints defined here.  
  - MUST reject any plan that violates these structural rules.

- **General Validator** (`validators/general.md`)  
  - May assume any input has already passed structural validation.  
  - Focuses on feasibility, risk, scope, and clarity of the plan items.

