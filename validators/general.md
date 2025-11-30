# General Validator

This file defines universal criteria for determining whether a proposed plan is appropriate, feasible, and safe.  
It evaluates the plan itself — not the system that created it, and not the system that will execute it.

If `AGENTS.md` conflicts with this file, `AGENTS.md` wins.

The General Validator does not judge technical correctness.  
It judges **scope, clarity, realism, and risk**.

It assumes that the plan has already passed **structural validation** against the canonical schema defined in `formatters/plan.md` (for example, via `validators/structure.md`).

---

## Mission

Ensure that any plan under review is:

- clear enough to understand without guessing  
- specific enough to act on without invention  
- modest enough in scope to be carried out without destabilizing the system  
- realistic in scale and complexity  
- limited to the domain in which it was authored  
- free from architectural rewrites, migrations, or speculative reinventions  
- grounded in observable evidence rather than hypothetical benefits  

The validator approves only plans that a disciplined engineer would consider **safe, targeted, and actionable**.

---

## Rejection Rules (Hard Constraints)

A plan MUST be rejected if it violates any of the following principles.

Before applying these rules, the plan MUST already:

- be valid JSON  
- conform to the schema defined in `formatters/plan.md`  
- satisfy all structural requirements enforced by the Structure Validator  

### 1. **The plan is excessively large or transformative**
Reject any plan that includes or implies:

- architectural redesigns  
- multi-module or system-wide restructuring  
- migrations to new frameworks or paradigms  
- replacement of core subsystems  
- renaming cascades across entire domains  
- broad pattern enforcement across large swaths of code  
- plans whose scale cannot be understood from their description  

A valid plan addresses **limited, well-defined surfaces**, not global transformations.

---

### 2. **The plan is vague, abstract, or conceptual**
Reject plans that:

- describe goals instead of actions  
- lack concrete file paths, targets, or examples  
- rely on speculation or hypothetical intentions  
- cannot be carried out without inventing missing details  
- ask for “improvements” without explaining what should change  

A plan must be **specific, actionable, and grounded**.

---

### 3. **The plan exceeds the domain it belongs to**
Every plan originates from some context.  
Reject if it attempts to:

- cross into unrelated domains  
- introduce concerns delegated to other rule sets  
- combine unrelated categories of change  
- intermingle complexity, security, dependency, documentation, etc.

Plans must be **internally coherent**.

---

### 4. **The plan carries disproportionate risk**
Reject plans that:

- risk unintended functional drift  
- alter foundational behaviors without explicit justification  
- adjust critical flows or security surfaces casually  
- modify sensitive code without accompanying safety considerations  
- involve many dependent surfaces with unclear interactions  

Only low-risk, tightly scoped plans should pass.

---

### 5. **The plan is unrealistic or unbounded**
Reject plans that:

- have unclear completion boundaries  
- rely on open-ended phrases (“standardize everything”, “improve overall design”)  
- implicitly require reading or editing vast portions of a system  
- cannot be reasoned about from the information provided  

A suitable plan has **recognizable edges**.

---

## Acceptance Rules (Soft Constraints)

A plan is generally acceptable when:

- it contains a **small number of focused items**  
- each item refers to **specific, identifiable surfaces**  
- its intentions are unambiguous  
- it is plausible for a careful engineer to complete without restructuring surrounding systems  
- it does not introduce or require new abstractions, tools, or architectural layers  
- its outcomes can be reasoned about without guessing  

In short:  
The plan should feel **surgical**, not sweeping.

---

## Output Behavior

The validator should produce one of the following:

### **APPROVE**  
Used when the plan is:

- targeted  
- coherent  
- concrete  
- realistic  
- appropriately scoped  

### **REJECT**  
Used when the plan violates any rejection rule.

If rejected, the validator should request a **smaller, clearer, or more focused revision**.

---

## Examples of Plans That Should Be Rejected

- “Refactor the entire authentication layer to a new pattern.”  
- “Standardize naming across the whole codebase.”  
- “Rewrite the architecture to use event sourcing.”  
- “Improve the design of the API.”  
- “Consolidate all services into a single module.”  
- “Migrate the project to a new framework.”

These are open-ended or transformative.

---

## Examples of Plans That Should Be Approved

- “Remove duplicated logic found in A and B.”  
- “Align naming for this small set of related items.”  
- “Extract a utility for repeated validation in these two files.”  
- “Simplify overly nested branching inside function X.”  
- “Fix inconsistent dependency versions between modules Y and Z.”  

These are clear, focused, and attainable.

---

## Final Principle

If a plan raises uncertainty about feasibility, scope, or risk:  
**reject it and request a smaller, clearer version.**

The validator must always favor safety, clarity, and incremental change.
