# Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Auditors](#auditors)
    - [Default Auditors](#default-auditors)
- [Validators](#validators)
    - [Default Validators](#default-validators)
    - [Validator Workflow](#validator-workflow)
- [Formatters](#formatters)
- [Schemas](#schemas)
    - [Plan Schema](#plan-schema)
    - [Config Schema](#config-schema)

# Overview
Driftlock is the implementation of a new type of tooling: an AI Orchestrator designed to fight entropy in your codebase, implemented for as a standalone tool following the POC and research described in this article published in Q4 2025: [Software and Thermodynamics: A Change of Paradigm in the Era of AI](https://will.lemiere.io/articles/software-and-thermodynamics-a-change-of-paradigm-in-the-era-of-ai).

# Getting Started

## Config

Start by creating a `driftlock.config.json` at the root of your project. It allows you to modify the default configuration, for example:

```
{
  "auditors": {
    "consistency": {
      "enabled": false
    },
    "security": {
      "path": "./.ai/auditors/security.md"
    }
  }
}
```

# Auditors

Auditors are the core logic of Driftlock. Each auditor defines domain-specific rules that guide the AI in analyzing your codebase. They are sophisticated prompts used for discovery. When using an auditor, the orchestrator is essentially given a set of instructions allowing the AI to scan the project for issues related to one of the nine pillars described below.

The default auditors can be found in the [auditors](./auditors/) folder, and can overriden in your project by adding a `driftlock.config.json` file to the root of your project.

It is recommended that you override the auditors with your own so that they are taylored to your project for an optimal result, but it is optional an the current auditors will perform well as they are designed to be stack agnostic.

When overriding auditors, we recommend to pick a location in your codebase to host your prompts collections, related to this project or not, such as `.ai`. Ideally, you would create `.ai/auditors` to write your own set of auditors.

You are also able to create any type of auditor you may imagine beyond the nine pillars described below that are provided by default.

## Default Auditors.

Below are the nine default auditors included with the orchestrator:

- **Complexity** — Focuses on reducing accidental complexity, cognitive load, duplication, and tangled logic. Aims to make the system expressive, elegant, and easy to reason about.  
  File: `complexity.md`

- **Consistency** — Ensures global alignment across naming, structures, patterns, contracts, and conventions. Enforces a coherent, uniform style throughout the system.  
  File: `consistency.md`

- **Dependency** — Audits dependency manifests and usage across the codebase. Ensures dependencies are minimal, consistent, safe, and free of drift.  
  File: `dependency.md`

- **Documentation** — Reviews documentation for accuracy, completeness, and alignment with the codebase. Ensures READMEs, ADRs, and architecture docs reflect reality without drift.  
  File: `documentation.md`

- **Modularity** — Evaluates module boundaries, dependency flow, and layering. Ensures the system remains well-structured, encapsulated, and maintainable.  
  File: `modularity.md`

- **Performance** — Identifies structural performance risks such as N+1 queries, heavy hot paths, inefficient flows, and missing signals. Focuses on backend and service-level performance characteristics.  
  File: `performance.md`

- **Quality** — Audits the test suite for correctness, determinism, completeness, and architectural alignment. Ensures high-risk scenarios are covered and regressions are detectable.  
  File: `quality.md`

- **Reliability** — Evaluates system resilience, observability, failure detection, and recoverability. Covers readiness/liveness probes, timeouts, metrics, dashboards, and alerting.  
  File: `reliability.md`

- **Security** — Focuses on tenant isolation, RBAC integrity, token and session handling, input validation, and secure transport. Prioritizes correctness of core security invariants.  
  File: `security.md`

# Validators

Validators are prompts that **evaluate plans** produced by auditors before any changes are executed.

They ensure that a plan is:

- structurally valid  
- safe in scope and risk  
- clear, concrete, and realistically executable  

Validators do not change code themselves; they approve or reject plans.

## Default Validators

Two validators are provided by default under `validators/`:

- **Structure**  
  - File: `validators/structure.md`  
  - Responsibility: validate that a plan is **well-formed JSON** and matches the canonical schema defined in `formatters/plan.md` and `schemas/plan.schema.json`.  
  - Rejects plans that:
    - are not valid JSON  
    - violate the required shape (fields, enums, max items, etc.)  
    - contain unknown or incorrectly typed fields  

- **General**  
  - File: `validators/general.md`  
  - Responsibility: validate that a structurally valid plan is **appropriate, feasible, and safe**.  
  - Rejects plans that:
    - are overly broad or architectural rewrites  
    - are vague, conceptual, or non-actionable  
    - cross too many domains or carry disproportionate risk  

The default `config.default.json` wires every auditor to both validators:

- First `structure`, then `general`.

## Validator Workflow

The typical flow for a single auditor run is:

1. **Auditor** generates a plan.  
2. **Structure validator** checks JSON validity and schema conformance.  
3. **General validator** checks scope, clarity, and risk (only if structure passed).  
4. If both validators approve, the orchestrator may proceed to apply or execute the plan.

This separation keeps syntax/shape concerns and semantic/risk concerns cleanly isolated.

# Formatters

The `formatters` directory defines **canonical data formats** used by auditors, validators.

These formats ensure that:

- LLM-based auditors produce structured outputs that tools can reliably consume.  
- Validators can enforce both **shape** and **semantics** of plans.  
- Orchestrators can wire together auditors and validators in a predictable pipeline.

---

## Plan Formatter (`formatters/plan.md`)

`plan.md` defines:

- the canonical JSON structure for all plans
- required and optional fields
- allowed values (`risk`, `category`)
- structural constraints (e.g., max 3 items, no extra keys)
- field semantics (`action`, `why`, `filesInvolved`, etc.)
- examples of valid and invalid plans

All auditors MUST emit plans that conform to `plan.md`.  
All validators MUST treat `plan.md` as the single source of truth for plan shape.

---

## JSON Schemas (`schemas/*.json`)

`schemas/plan.schema.json` provides a machine-readable JSON Schema (2020-12) equivalent of the rules in `formatters/plan.md`.
`schemas/config.schema.json` defines the expected structure of the orchestrator configuration (e.g., `config.default.json` and `driftlock.config.json`).

It enables:

- automated validation in CI/CLI tools
- editor integrations and plugins
- future orchestrator or agent tooling to validate plans independently of LLMs

When in doubt, the human-readable rules in `plan.md` are authoritative; `plan.schema.json` should stay in sync with it.

---

## How Validators Use the Formatter

- `validators/structure.md`  
  - Validates that a plan’s JSON structure matches `plan.md` / `plan.schema.json`.  
  - Rejects any plan that is not valid JSON or violates structural rules.

- `validators/general.md`  
  - Assumes the plan has already passed structural validation.  
  - Focuses on feasibility, risk, scope, and appropriateness of the actions.

---

## Extending the Schema

To evolve the plan format:

1. Propose changes in `formatters/plan.md` (new fields, enums, or constraints).  
2. Update `schemas/plan.schema.json` to match.  
3. Update validators (`structure.md`, `general.md`) to recognize the new rules.  

Changes should be additive and backwards-compatible when possible to avoid breaking existing tooling.

# Schemas

The `schemas` directory contains **JSON Schemas** used for machine validation of configuration and plan data.

These schemas complement the human-readable Markdown formatters by providing strong typing and tooling-friendly contracts.

## Plan Schema

- File: `schemas/plan.schema.json`  
- Purpose: enforce the canonical plan structure:  
  - top-level `{ "plan": [...] }` object  
  - required fields (`action`, `why`, `filesInvolved`, `category`)  
  - allowed enums (`risk`, `category`)  
  - maximum of 3 plan items and no extra keys  
- Used by:
  - `validators/structure.md` (conceptually)  
  - any CI/CLI/editor tooling that wants to validate plan JSON emitted by auditors  

## Config Schema

- File: `schemas/config.schema.json`  
- Purpose: define the expected structure of orchestrator configuration files such as `config.default.json` and `driftlock.config.json`.  
- Validates:
  - `auditors` map and each auditor’s `enabled`, `path`, and `validators` fields  
  - `validators` map (name → path)  
  - `formatters.plan` and `formatters.schema` paths  
- Editors and tooling can use this schema (via the `$schema` field in `config.default.json` or your own `driftlock.config.json`) to provide validation and autocomplete for configuration changes.
