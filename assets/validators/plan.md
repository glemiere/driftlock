# Plan Validator

This validator determines whether a proposed plan is **appropriate, feasible, safe, and within scope**.  
It evaluates the **plan itself** — not the system that created it, and not the system that will execute it.

If `AGENTS.md` conflicts with this file, **`AGENTS.md` wins**.

---

## Mission

Approve only plans that a disciplined engineer would consider:

- **clear** enough to understand without guessing  
- **specific** enough to act on without invention  
- **small** enough in scope to avoid destabilizing the system  
- **realistic** in scale, complexity, and feasibility  
- **contained** within the domain/auditor that produced them  
- **grounded** in observable evidence rather than assumptions  
- **safe** in blast radius and impact
- **stateless**: made of stateless steps that can be executed independently.

The validator is biased toward **conservatism**:  
when uncertain, **reject** and request a narrower plan.

---

## Rejection Rules (Hard Constraints)

If **any** of the following apply, the entire plan MUST be rejected.

---

### 1. Excessive Scope or Transformative Intent

Reject items that include or imply:

- architectural redesigns or paradigm shifts  
- migrations to new frameworks or large-scale patterns  
- cross-module or cross-domain rewrites  
- renaming or restructuring wide areas of the codebase  
- global standardization efforts (“rename across repo”, “make everything consistent”)  
- unclear or massive scope (“touch all services”, “refactor entire system”)  

A valid plan addresses **limited, well-defined surfaces**.

---

### 2. Vague or Conceptual Items

Reject items that:

- describe **goals**, not **actions**  
- lack concrete paths, files, or explicit targets  
- require “filling in the blanks”  
- rely on speculation (“should probably…”, “maybe adjust…”)  
- propose improvements without defining what to change  
- refer to nonexistent or uncertain surfaces  

A plan must be **specific, actionable, and unambiguous**.

---

### 3. Cross-Domain or Out-of-Scope Work

Reject items that:

- exceed the concerns delegated to the auditor that produced them  
- combine unrelated domains (e.g., complexity + security + dependencies)  
- alter surfaces outside the auditor’s charter  
- intermingle stylistic, architectural, or operational concerns without justification  

Plans must be **internally coherent** and domain-pure.

---

### 4. Disproportionate Risk or High Blast Radius

Reject items that:

- could cause functional drift  
- adjust critical flows without explicit justification  
- modify sensitive security, data, or infrastructure paths casually  
- involve many dependent surfaces with unclear interactions  
- meaningfully impact reliability or performance without safeguards  
- introduce new abstractions, tools, or concepts  

Only **low-risk, reversible, localized** plans are acceptable.

---

### 5. Unrealistic, Unbounded, or Undefined Effort

Reject if the plan:

- lacks clear completion boundaries  
- involves an undefined amount of exploration  
- implies touching large, unenumerated parts of the system  
- includes open-ended instructions (“standardize everything”, “improve overall design”)  
- cannot be reasoned about using only the information inside the plan  

A suitable plan has **recognizable edges** and a clear finish line.

---

### 6. Intersects With Excluded Paths

If the configuration defines an `exclude` list, reject any plan item where:

- `filesInvolved` contains an excluded file or folder  
- the file lives inside an excluded directory  
- the item would require reading, modifying, or reorganizing excluded paths  

Exclusion lists are **absolute**.

---

### 7. Accuracy Against the Actual Codebase

A plan must be realistic and applicable to the current repository.

Reject the plan if:

- any proposed action refers to files, directories, or modules that do not exist,
- the proposed solution cannot be carried out with the current code structure,
- the step requires architectural elements that the project does not provide,
- the plan assumes helper functions, modules, or patterns that the codebase does not have,
- the solution contradicts existing boundaries, invariants, or repo conventions.

This accuracy check ensures that the plan is grounded in the actual state of the codebase, not in assumptions or abstractions.

## Acceptance Rules (Soft Guidance)

A plan is generally acceptable when:

- it contains **1–3 tightly focused items**  
- each item names **specific, identifiable paths**  
- intentions are **explicit and unambiguous**  
- scope is **modest**, risk is **low**, and changes are **localized**  
- outcomes are **predictable**, reversible, and evidence-backed  
- no item requires architectural understanding beyond its described surfaces  

The plan should feel **surgical, not sweeping**.

---

## Output Behavior

The validator must output one of:

### **APPROVE**  
Used when all items are:

- targeted  
- coherent  
- concrete  
- feasible  
- scoped  
- risk-appropriate  

### **REJECT**  
Used when **any** hard constraint is violated.

When rejecting, request:  
**“Provide a smaller, clearer, more focused revision.”**

---

## Examples of Plans That MUST Be Rejected

- “Refactor the entire authentication layer to a new pattern.”  
- “Standardize naming across the whole codebase.”  
- “Rewrite the architecture to use event sourcing.”  
- “Improve the design of the API.”  
- “Consolidate all services into a single module.”  
- “Migrate the project to a new framework.”  
- “Simplify everything under `/services`.”  
- “Cleanup any unclear logic in the controllers.”  
- "Introduce a new dependency to the project."

These are open-ended, high-risk, or transformative.

---

## Examples of Plans That SHOULD Be Approved

- “Remove duplicated logic found in `utils/string.ts` and `utils/format.ts`.”  
- “Align naming for the three enum values in `permissions.ts`.”  
- “Extract a small validation helper used in two files.”  
- “Simplify nested branching inside `parseUser()`.”  
- “Fix inconsistent dependency versions between `packageA` and `packageB`.”  

These are concrete, scoped, and safe.

---

## Final Principle

When in doubt:  
**reject the plan** and require a narrower, clearer proposal.

Safety > creativity.  
Clarity > cleverness.  
Incremental change > sweeping change.
