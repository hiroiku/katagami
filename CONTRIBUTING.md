# Contributing to Katagami

Use Bun 1.3.14 and Node.js 22 or 24. Install with `bun install --frozen-lockfile`.

Run `bun run verify` before proposing a change. This runs formatting/lint checks, type tests,
the library build, runtime tests with the existing coverage requirement, runnable examples,
an offline install of the packed package, and Markdown link/snippet checks.

Use `bun run format` to apply formatting. `bun run check` is read-only.
Type tests in `src/**/typetest.ts` are compiled separately and are never executed.
Use `@ts-expect-error` to establish a negative compile-time guarantee, and runtime tests for runtime behavior.

The English README and `docs/guide.md` are the canonical API reference. Localized READMEs provide
localized onboarding and link to detailed English guides. All TypeScript Markdown fences are checked;
write self-contained examples with imports. Mark deliberately invalid lines with `@ts-expect-error`
and explain the correction immediately. Do not silently relax the type checker to make a snippet pass.

Maintain the distinction between accumulated tokens and predeclared interface maps, and between
structural class compatibility and runtime token identity. Quantitative AI performance claims require
the [evaluation evidence](./benchmarks/agent-wiring/README.md), including unsuccessful runs.
