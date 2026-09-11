# Evaluating dependency wiring with coding agents

Status: protocol and task definitions prepared; no agent trial results have been collected.
The repository's compiler checks are not an agent benchmark.

## Question

Does accumulated dependency typing help a coding agent complete wiring changes correctly,
compared with ordinary typed constructor/function injection? Both variants use strict TypeScript
and the same behavior tests. The baseline must retain normal parameter types; do not make it
artificially untyped. This comparison evaluates the complete approaches, not the isolated causal
effect of one type feature.

## Tasks

The [task definitions](./tasks.json) specify three changes to the checked initial
[manual fixture](./fixtures/manual/app.ts) and [Katagami fixture](./fixtures/katagami/app.ts).
Both start with the same named/guest greetings, isolated requests and rejection cleanup.
`bun run test:agent-fixtures` verifies that baseline. The task-specific acceptance checks
are deliberately unsatisfied initially; each trial implements one change from a fresh baseline.

Freeze the release commit before trials and record it alongside every attempt. An independent
reviewer should confirm equivalent task difficulty. Do not change the evaluator during a comparison.

For each task, edit only the chosen fixture's `app.ts` and run:

```sh
node scripts/run-agent-task.mjs add-dependency katagami
```

Replace the task and variant as appropriate. Both variants use the same evaluator and strict checks.
The source checker rejects explicit `any`, assertions and type suppressions. Review the final diff
independently as well; a source scan is not a proof that every possible shortcut was prevented.

Required API changes for each task:

- `add-dependency`: accept an optional third argument `(name: string) => string` in `createApp`;
  keep the existing default greeting, and use the injected formatter for named and guest greetings.
- `request-isolation`: include `auditRequestId` in each result, produced by the request's audit service;
  it must equal that result's `requestId` and differ across concurrent requests.
- `async-dependency`: change the first `createApp` argument to `() => Promise<UserRepository>`;
  initialize it once per app, share the result, and propagate initialization rejection.

## Execution protocol

1. Use the same model version, reasoning setting, tool permissions, task prompt and budget in both variants.
2. Use isolated fresh checkouts and conversations. Supply the applicable documentation to both variants.
3. Run at least five independent attempts for each of the three tasks in each variant (30 trials).
4. Interleave the variants and preserve every attempt, including timeouts and failures.
5. Have the agent run the same acceptance tests. Run them again independently after the attempt.
6. Reject changes that suppress errors, widen types with `any` or assertions, weaken tests, or remove scope isolation.
7. Record observed input/output tokens from the execution provider, elapsed time, repair iterations,
   type-check outcome and test outcome. Use null for unavailable token counts; never estimate them as zero.

Do not send private application code to another service to run this protocol. The public starter
is sufficient. Select the execution provider and any paid run budget before starting trials.

## Record and summarize

Write one JSON object per line to the ignored `results.local.jsonl` file. Required fields:

```json
{
  "task": "add-dependency",
  "variant": "katagami",
  "attempt": 1,
  "model": "record-the-exact-version",
  "settings": "record-reasoning-tools-and-budget",
  "fixtureCommit": "record-the-frozen-commit",
  "typecheckPassed": false,
  "testsPassed": false,
  "forbiddenBypasses": [],
  "inputTokens": null,
  "outputTokens": null,
  "seconds": 0,
  "repairIterations": 0,
  "log": "path-to-the-trial-log"
}
```

This is a schema illustration, not a measured trial. Fill it from the actual execution log.

```sh
node scripts/summarize-agent-results.mjs benchmarks/agent-wiring/results.local.jsonl
```

The summary groups by task, variant, model, settings and fixture commit. A successful attempt
must pass both checks and contain no forbidden bypasses. Report denominators and missing token
observations. Compare balanced groups; a few attempts cannot establish broad performance claims.

Publish the frozen fixtures, prompts, settings, raw results and failure categories with any
quantitative claim. Separate compilation success from correct runtime behavior and continued adoption.
