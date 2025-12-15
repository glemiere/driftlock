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
Driftlock is the implementation of a new type of tooling: an AI Orchestrator designed to fight entropy in your codebase, implemented as a standalone tool following the POC and research described in this article published in Q4 2025: [Software and Thermodynamics: A Change of Paradigm in the Era of AI](https://will.lemiere.io/articles/software-and-thermodynamics-a-change-of-paradigm-in-the-era-of-ai).

# Getting Started

## Prerequisites

As of today, you need to have both the git CLI and the codex CLI installed on your machine to be able to run this software. Later, I will add more frictionless and diverse ways to authenticate with these two dependencies as needed. If you need that, feel free to contribute.

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

The default auditors live under `assets/auditors/` and can be overridden in your project by adding a `driftlock.config.json` file to the root of your project.

It is recommended that you override the auditors with your own so that they are taylored to your project for an optimal result, but it is optional an the current auditors will perform well as they are designed to be stack agnostic.

When overriding auditors, we recommend to pick a location in your codebase to host your prompts collections, related to this project or not, such as `.ai`. Ideally, you would create `.ai/auditors` to write your own set of auditors.

You are also able to create any type of auditor you may imagine beyond the nine pillars described below that are provided by default.

## Default Auditors

Below are the nine default auditors included with the orchestrator:

- **Complexity** — Focuses on reducing accidental complexity, cognitive load, duplication, and tangled logic. Aims to make the system expressive, elegant, and easy to reason about.  
  File: `assets/auditors/complexity.md`

- **Consistency** — Ensures global alignment across naming, structures, patterns, contracts, and conventions. Enforces a coherent, uniform style throughout the system.  
  File: `assets/auditors/consistency.md`

- **Dependency** — Audits dependency manifests and usage across the codebase. Ensures dependencies are minimal, consistent, safe, and free of drift.  
  File: `assets/auditors/dependency.md`

- **Documentation** — Reviews documentation for accuracy, completeness, and alignment with the codebase. Ensures READMEs, ADRs, and architecture docs reflect reality without drift.  
  File: `assets/auditors/documentation.md`

- **Modularity** — Evaluates module boundaries, dependency flow, and layering. Ensures the system remains well-structured, encapsulated, and maintainable.  
  File: `assets/auditors/modularity.md`

- **Performance** — Identifies structural performance risks such as N+1 queries, heavy hot paths, inefficient flows, and missing signals. Focuses on backend and service-level performance characteristics.  
  File: `assets/auditors/performance.md`

- **Quality** — Audits the test suite for correctness, determinism, completeness, and architectural alignment. Ensures high-risk scenarios are covered and regressions are detectable.  
  File: `assets/auditors/quality.md`

- **Reliability** — Evaluates system resilience, observability, failure detection, and recoverability. Covers readiness/liveness probes, timeouts, metrics, dashboards, and alerting.  
  File: `assets/auditors/reliability.md`

- **Security** — Focuses on tenant isolation, RBAC integrity, token and session handling, input validation, and secure transport. Prioritizes correctness of core security invariants.  
  File: `assets/auditors/security.md`

# Validators

Validators are prompts that **evaluate plans** produced by auditors before any changes are executed.

They ensure that a plan is:

- structurally valid  
- safe in scope and risk  
- clear, concrete, and realistically executable  

Validators do not change code themselves; they approve or reject plans.

## Default Validator

One validator is provided by default under `assets/validators/`:

- **Plan**  
  - File: `assets/validators/plan.md`  
  - Responsibility: validate that a plan is structurally valid **and** appropriate, feasible, and safe per the canonical schema defined in `assets/formatters/plan.md` and `assets/schemas/plan.schema.json`.  
  - Rejects plans that are not valid JSON, violate the schema shape, are overly broad or architectural rewrites, are vague/non-actionable, cross too many domains, or carry disproportionate risk.  

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

The `assets/formatters` directory contains human-readable guidance for producing plan outputs. The authoritative shape is defined by the JSON schema in `assets/schemas/plan.schema.json`; the formatter doc is a companion guide to help LLMs emit compliant plans.

Key points:

- Plans must follow `assets/schemas/plan.schema.json` (required `steps`, max 3 items, no extra keys).
- The guidance in `assets/formatters/plan.md` is descriptive, but schema/validators enforce the shape.

---

## JSON Schemas (`assets/schemas/*.json`)

`assets/schemas/plan.schema.json` provides a machine-readable JSON Schema (2020-12) equivalent of the rules in `assets/formatters/plan.md`.
`assets/schemas/config.schema.json` defines the expected structure of the orchestrator configuration (e.g., `config.default.json` and `driftlock.config.json`).

It enables:

- automated validation in CI/CLI tools
- editor integrations and plugins
- future orchestrator or agent tooling to validate plans independently of LLMs

When in doubt, the human-readable rules in `plan.md` are authoritative; `plan.schema.json` should stay in sync with it.

---

## How Validators Use the Formatter

- `assets/validators/structure.md`  
  - Validates that a plan’s JSON structure matches `assets/formatters/plan.md` / `assets/schemas/plan.schema.json`.  
  - Rejects any plan that is not valid JSON or violates structural rules.

- `assets/validators/plan.md`  
  - Performs both structural and general validation (schema conformance, feasibility, risk, scope, appropriateness).

---

## Extending the Schema

To evolve the plan format:

1. Propose changes in `assets/formatters/plan.md` (new fields, enums, or constraints).  
2. Update `assets/schemas/plan.schema.json` to match.  
3. Update validators (`assets/validators/plan.md`) to recognize the new rules.  

Changes should be additive and backwards-compatible when possible to avoid breaking existing tooling.

# Schemas

The `assets/schemas` directory contains **JSON Schemas** used for machine validation of configuration and plan data.

These schemas complement the human-readable Markdown formatters by providing strong typing and tooling-friendly contracts.

## Plan Schema

- File: `assets/schemas/plan.schema.json`  
- Purpose: enforce the canonical plan structure:  
  - top-level `{ "plan": [...] }` object  
  - required fields (`action`, `why`, `filesInvolved`, `category`, `steps`)  
  - `risk` enum and optional fields as defined in the schema  
  - maximum of 3 plan items and no extra keys  
- Used by:
  - `assets/validators/plan.md`  
  - any CI/CLI/editor tooling that wants to validate plan JSON emitted by auditors  

## Config Schema

- File: `assets/schemas/config.schema.json`  
- Purpose: define the expected structure of orchestrator configuration files such as `config.default.json` and `driftlock.config.json`.  
- Validates:
  - `auditors` map and each auditor’s `enabled`, `path`, `validators`, optional `model`  
  - `validators` map (name → object with `path` and optional `model`)  
  - `formatters.plan`, `formatters.schema`, optional `model`  
  - top-level `exclude` array and optional `model`  
- Editors and tooling can use this schema (via the `$schema` field in `config.default.json` or your own `driftlock.config.json`) to provide validation and autocomplete for configuration changes.

### Commands and fail-only variants

The top-level config also defines shell commands used by the quality gate:

- `commands.build` — build/typecheck command (non-zero exit code on failure).  
- `commands.test` — test command (non-zero exit code on failure).  
- `commands.lint` — lint command (non-zero exit code on failure).  

Optionally, you can provide **fail-only / concise variants** via `commandsFailOnly`:

```jsonc
"commandsFailOnly": {
  "build": "npm run build:fail-only",
  "test": "npm run test:fail-only",
  "lint": "npm run lint:fail-only"
}
```

These are not required. When present, they can be used to give the regression loop shorter, failure-focused logs while still relying on `commands.*` and exit codes for actual pass/fail decisions.

### Baseline quality gate

The top-level config also includes `runBaselineQualityGate` (default: `true`):

- When `true`, Driftlock runs a full `build` → `lint` → `test` cycle once before any auditor executes, to establish baseline health.
- When `false`, the orchestrator skips this baseline check and proceeds directly to auditor plans.

Retry-related caps can also be tuned:

- `maxRegressionAttempts` — maximum number of regression-fix attempts per step (0 means unbounded).  
- `maxThreadLifetimeAttempts` — maximum number of Codex executor calls (apply + fix_regression) per step (0 means unbounded).  

Defaults are conservative (`maxRegressionAttempts: 5`, `maxThreadLifetimeAttempts: 10`). For most projects you should keep caps enabled; setting them to `0` removes the guardrail and may cause long-running loops when underlying suites are persistently red.

######
Developed with ❤️ by @glemiere.
