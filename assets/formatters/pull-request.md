# Pull Request Title + Body Formatter (Driftlock)

You are generating a GitHub Pull Request **title** and **body** for a Driftlock run that committed one or more plans.

## Input

You will be given a JSON payload that contains the list of committed plans and their high-level actions.
Treat the input as the **only** source of truth. Do **not** invent changes.

## Output (STRICT)

Return a single JSON object matching the schema:

```json
{ "title": "...", "body": "..." }
```

## Rules

- Title:
  - concise, imperative, no trailing period
  - summarize the overall intent across all committed plans
  - keep it short (aim ≤ 72 chars)
- Body (Markdown):
  - start with a short summary paragraph
  - include a “Changes” section that mentions **each committed plan** (plan name + key actions)
  - do not claim tests were run unless explicitly stated in the input
  - include a short note that this PR was produced by Driftlock

## Input Payload

The JSON payload starts after this line:

RUN_SUMMARY_JSON:
