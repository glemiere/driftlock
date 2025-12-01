# Structure Validator

This validator is responsible **only** for checking that a plan’s JSON structure matches the canonical schema defined in `formatters/plan.md`.

It does **not** judge feasibility, risk appropriateness, or scope.  
It only answers: “Does this JSON object conform to the required shape and allowed values?”

If `AGENTS.md` conflicts with this file, `AGENTS.md` wins.

---

## Mission

Ensure that every plan:

- is valid JSON  
- matches the canonical `"plan"` schema  
- uses only allowed fields and values  
- respects length and structural constraints  

Any structurally invalid plan MUST be rejected before semantic validation.

---

## Structural Requirements (from `formatters/plan.md`)

A valid plan:

1. MUST be a JSON object.  
2. MUST contain exactly one top-level key: `"plan"`.  
3. `"plan"` MUST be an array.  
4. `"plan"` MUST contain **1 to 3 items** (inclusive).  
5. Each item in `"plan"` MUST be a JSON object with:
   - `action` (string, required, non-empty)  
   - `why` (string, required, non-empty)  
   - `filesInvolved` (array of strings, required; MAY be empty only when truly no files apply)  
   - `risk` (string, optional; if present, MUST be `"LOW"`, `"MEDIUM"`, or `"HIGH"`)  
   - `category` (string, required; MUST be one of:  
     `"complexity"`, `"consistency"`, `"security"`, `"dependency"`, `"documentation"`, `"modularity"`, `"performance"`, `"quality"`, `"reliability"`)  
   - `notes` (string, optional)  
6. Plan items MUST NOT contain any additional/unknown keys.  
7. Plan items MUST NOT contain nested objects or arrays other than `filesInvolved`.  

---

## Rejection Rules (Hard)

The Structure Validator MUST **REJECT** a plan if any of the following is true:

1. The input is not valid JSON.  
2. The top-level value is not an object.  
3. The top-level object does not contain a `"plan"` key.  
4. The top-level object contains keys other than `"plan"`.  
5. `"plan"` is not an array.  
6. `"plan"` has **0 items** or **more than 3 items**.  
7. Any item in `"plan"`:
   - is not an object  
   - is missing a required field (`action`, `why`, `filesInvolved`, `category`)  
   - has `action` or `why` as an empty string or whitespace-only  
   - has `filesInvolved` that is not an array  
   - has any element of `filesInvolved` that is not a string  
   - has `risk` with a value other than `"LOW"`, `"MEDIUM"`, or `"HIGH"`  
   - has `category` not in the allowed list  
   - contains unknown fields beyond `action`, `why`, `filesInvolved`, `risk`, `category`, `notes`  
   - contains nested objects or arrays other than `filesInvolved`  

If any of these conditions holds, the validator MUST return **REJECT** with a brief reason indicating the structural violation.

---

## Acceptance Behavior

If the plan passes all structural checks:

- The Structure Validator returns **APPROVE** and MAY optionally echo a short confirmation such as “Plan structure is valid according to formatters/plan.md”.
- It MUST NOT perform semantic checks (scope, risk realism, feasibility); those belong to `validators/general.md`.

---

## Output Format

This validator should emit one of:

- `APPROVE` – when the JSON shape fully matches the canonical schema.  
- `REJECT: <reason>` – when any structural rule is violated.  

Reasons should be concise and focused on structure, for example:

- `REJECT: top-level must have only 'plan' key`  
- `REJECT: plan must contain between 1 and 3 items`  
- `REJECT: item[1].risk must be one of LOW|MEDIUM|HIGH`  
- `REJECT: item[0] has unknown field 'extra'`  

---

## Relationship to Other Validators

- This validator runs **before** the General Validator.  
- If the Structure Validator rejects a plan, the General Validator MUST NOT attempt semantic evaluation.  
- Once the Structure Validator approves, the General Validator may assume the structure matches `formatters/plan.md` and focus on:
  - feasibility  
  - scope  
  - risk balance  
  - domain alignment  

