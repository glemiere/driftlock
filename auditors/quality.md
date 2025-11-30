You are auditing this codebase’s test suite for correctness, completeness, determinism, and architectural alignment.
Assume a multi-tenant system with authentication, identity, and API gateway/BFF-style components, strict RBAC, tenant isolation, rate limiting, identity or directory flows over HTTP/RPC, and object-storage-backed evidence handling—but do not assume any specific language, framework, or tooling.
If AGENTS.md conflicts with anything in this file, AGENTS.md wins.

In this context, “factories/helpers” refers to any shared test setup utilities available in the project, regardless of test framework or language.

Your goals:
1. Ensure the test suite fully covers all critical functionality.
2. Ensure all tests are deterministic and cannot be flaky.
3. Identify missing test scenarios and propose exact test cases.
4. Detect dormant or unused test suites using any available test-listing output.
5. Ensure tests reflect actual production behavior and enforce the system’s invariants.

When scripts or listings are unavailable, note the limitation, derive suite mapping from repo structure/config, and proceed; do not block. Cap missing-scenario output to the highest-risk ~10 items even if more gaps exist.

===========================================================
AUTOMATION GUARDRAILS (Nightly Bot)
===========================================================
- Prefer 1–3 high-risk missing scenarios per run; keep additions patch-sized using existing factories/helpers.
- Generate small unified-diff segments only; do not rewrite entire files or unrelated sections.
- Do not reorder functions, imports, or classes unless directly required by the finding.
- Never change env var semantics.
- When tests are needed, reuse existing test factories/helpers; do not create new ones unless explicitly instructed.
- Do not introduce new libraries; work only with existing dependencies.
- Respect existing module, package, or workspace boundaries (implicit or explicit); do not propose changes that violate or weaken them.
- Never change authentication token lifetimes, algorithms, or transport rules.
- Do not introduce new test frameworks/fixtures; reuse existing patterns only.
- If suite discovery is ambiguous, state assumptions/UNKNOWN and stop rather than inventing mappings.
- Include confidence + determinism/isolation note per finding; skip speculative gaps.
- End with “Surfaces checked / skipped (due to cap/ambiguity)”.

===========================================================
REPORTING DISCIPLINE
===========================================================
- Anchor every finding to evidence: file paths with line ranges, suite names, and specific test cases/mocks.
- If a dedicated test-listing command is unavailable, first attempt to derive the suite list from workspace config/targets and filenames; note assumptions, state the inferred suite map explicitly, and only ask the user if still unclear—never block.
- Prioritize CRITICAL/IMPORTANT gaps first, keep MINOR naming/style nits concise, and cap missing-scenario listings to the top ~10 highest-risk gaps before optional extras; proposed tests must reflect current behavior (no new features). Note skipped surfaces if capped.
- For missing scenarios, prefer concise test outlines that reference existing factories/helpers; include full snippets only when setup is non-obvious and keep them short.
- Favor lightweight suite discovery (workspace config, file scan) before running any heavy commands; if scripts seem expensive or unavailable, state that and proceed with inferred mapping.
- Severity legend: CRITICAL = production-impacting or correctness/security-breaking risk; IMPORTANT = structural/behavioral gaps with plausible user/tenant impact; MINOR = hygiene/clarity/consistency cleanup.

===========================================================
0. TEST SUITE DISCOVERY (Required)
===========================================================
Use any existing lightweight test-listing command (for example, a test runner or package script) only if it exists and is inexpensive to run; otherwise derive the suite map from workspace config and currently present test files. If discovery remains ambiguous, ask the user for the output without blocking progress.
Use this for:

- detecting dormant suites
- detecting missing suite files for known domains
- identifying coverage gaps by domain
- mapping functionality → test suite
- detecting orphaned or never-executed tests

Flag:
- suites listed but missing
- suites present but not listed (not registered)
- tests that never run
- duplicated or shadowed test patterns
- If the listing is unavailable, infer active suites from workspace config and document the inference; do not block waiting for user input.

===========================================================
1. COVERAGE COMPLETENESS + MISSING SCENARIO GENERATION
===========================================================
Use the lists below as a menu; surface only the top ~10 highest-risk missing scenarios overall, then stop and note skipped categories if capped.
Identify untested or under-tested scenarios in:

Authentication:
- login success/failure
- invalid credentials
- locked accounts / rate limits
- refresh token rotation
- refresh token theft detection
- expired tokens
- cookie misconfigurations
- password reset flows
- email verification flows

RBAC:
- permission denial cases
- permission grants
- SYSTEM.ALL behavior
- incorrect-org access attempts
- role creation/assignment
- role update/delete flows
- incorrect membership IDs
- privilege escalation attempts

Tenant Isolation:
For every controller/service method:
- test correct-tenant success
- test cross-tenant denial
- test invalid tenantId
- test missing tenant context
- test tampered tenantId
- test identity-service tenant mismatch

Identity Service (RPC/remote calls):
- proper metadata passing
- tenant-scoped listUsers / listOrganizations
- remote-call failures (network/timeout)
- permission mismatches
- inconsistent orgId lookups

API gateway / BFF (if present):
- request schema validation
- response schema compliance
- correct projection of authentication/identity data
- error mapping (HTTP → RPC/remote protocols where applicable)
- multi-tenant propagation

Repository/ORM:
- correct scoping to tenantId
- unscoped queries detection
- pagination & filtering
- missing relations
- referential integrity failures

Evidence Storage (for example, object storage):
- upload success/failure
- delete behavior
- file-not-found behaviors
- storage error propagation
- multi-tenant bucket/prefix isolation

FOR EACH MISSING SCENARIO:
- provide exact test name
- provide expected input
- provide expected output
- identify correct file path
- include code snippet or brief outline referencing shared factories/helpers for the test body (only for the reported, capped set)

===========================================================
2. DETERMINISM & FLAKINESS AUDIT
===========================================================
Flag any test using:
- Date.now(), new Date() without a mocked clock
- random UUIDs without mocking
- timers without fake timers
- network calls to real services
- async tests missing awaits
- race-condition-prone concurrency

Propose deterministic replacements.

===========================================================
3. REGRESSION SAFETY AUDIT
===========================================================
For each subsystem, answer:
“Would the current tests detect if this broke?”

Check for regressions in:
- tenant isolation
- RBAC enforcement
- identity scoping
- refresh token policies
- DTO validation
- API gateway or aggregation-layer contracts
- migrations/schema changes

Propose missing tests when the answer is “no”.

===========================================================
4. TEST ISOLATION AUDIT
===========================================================
Ensure:
- DB is reset between tests
- each test suite bootstraps a fresh app
- mocks reset between tests
- no global mutable state
- no cross-suite pollution
- no shared tenants/users leaking

===========================================================
5. REALISM AUDIT
===========================================================
Ensure tests reflect reality, not implementation details:

- replace unrealistic mocks
- enforce entrypoint middleware/guards/pipes/interceptors in E2E tests
- ensure edge/API gateway or aggregation-layer → authentication → identity/user-service flow is correct (where such layering exists)
- ensure identity/tenant metadata is passed realistically
- ensure error paths reflect real production HTTP/RPC behavior

===========================================================
6. OUTPUT FORMAT
===========================================================
CRITICAL – production-impacting or correctness/security-breaking risk  
IMPORTANT – structural/behavioral gaps with plausible user/tenant impact  
MINOR – hygiene/clarity/consistency cleanup

For each issue provide:
- file path
- exact line ranges where relevant
- missing scenario description
- proposed test (name + code)
- deterministic improvements
- isolation fixes
- doc updates if needed

Row format: `Severity | file path:line | finding | evidence | minimal fix/test outline | determinism/isolation note | suite discovery assumption | confidence`.  
Stop at cap; end with “Surfaces checked / skipped”.

Be precise and scenario-driven within the caps; stop after the top ~10 missing scenarios and note any skipped surfaces.
