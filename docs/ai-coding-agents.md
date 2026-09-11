# TypeScript dependency injection with AI coding agents

Use Katagami's accumulated registration types as feedback while an agent edits dependency wiring.
This guide describes the v3 API. Check the installed package version before editing an existing app.

## A repeatable workflow

1. Read the composition root, nearby service constructors and tests.
2. Define dependencies explicitly in factories. Start with `createContainer()` and preserve inferred types.
3. Register a dependency before the factory that uses it. Resolve services through `createScope(container)`.
4. Choose a lifetime: singleton for shared infrastructure, scoped for request state, transient for a new instance per resolution.
5. Run the application's `npx tsc --noEmit`, then its existing tests.
6. Correct registration, lifetime or asynchronous usage based on diagnostics. Repeat until both checks pass.

When changing Katagami itself, use `bun run verify` instead; it includes type tests,
runtime tests, examples, the packed package and documentation checks.

## Minimal working example

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('users', async () => ({ findName: (id: string) => `user-${id}` }))
  .registerScoped('handler', async r => {
    const users = await r.resolve('users');
    return (id: string) => users.findName(id);
  });

const scope = createScope(container);
const handler = await scope.resolve('handler');
handler('42');
```

Use the [request-scope starter](../examples/request-scope/README.md) for cleanup,
concurrent calls and replacement of infrastructure with a fake.

## Diagnose the error before changing code

| Diagnostic or symptom | Check | Typical correction |
| --- | --- | --- |
| `No overload matches this call` at `resolve`, often mentioning `never` | Is this exact token registered and visible here? | Register it earlier, correct its spelling, or compose the module first |
| The same error inside a singleton/transient factory after a scoped registration | Does the factory capture request state? | Make the consumer scoped, or pass request data into a method without storing it |
| A service method does not exist on `Promise<...>` | Is the dependency factory async? | Await the resolution; make the consuming factory async if needed |
| `resolve` does not exist on `Container` | v3 separates registration from resolution | Call `createScope(container).resolve(token)` |
| `lazy` rejects a token | Is it an async or PropertyKey token? | Use direct resolution; `lazy` accepts synchronous class tokens |
| Runtime `Token ... is not registered` despite a passing type check | Predeclared map, compatible class, widened key or assertion? | Register the actual token and review the type-safety guide |

The wording of compiler diagnostics varies with TypeScript versions. Check the failing
expression and the resolver's visible registrations; do not match an error string blindly.

## Project instruction you can copy

```text
Use the installed Katagami v3 API for dependency wiring. Read
node_modules/katagami/docs/ai-coding-agents.md and
node_modules/katagami/docs/type-safety.md first.
Preserve inferred registration chains and narrow literal/unique-symbol tokens.
Resolve through createScope. Keep request state scoped and await async dependencies.
Use explicit factories and inject fakes in tests.
Fix type errors at their cause; do not silence them with any, assertions,
@ts-ignore, @ts-expect-error or optional resolution for required dependencies.
Run this application's type checker and tests after changes.
```

Add this instruction to the project instructions your agent already reads, or pass it explicitly
with the task. Installing a dependency does not ensure that an agent reads its documentation.

## Guarantees and evidence

Accumulated literal keys and unique symbols provide a finite set of registered tokens.
Class tokens follow structural compatibility; predeclared service maps can name missing factories.
See [the complete guarantee and boundary examples](./type-safety.md).

The compiler checks and example tests are automated in CI. Agent repair success and token savings
are hypotheses, not measured product claims. Use the
[controlled evaluation protocol](https://github.com/hiroiku/katagami/tree/master/benchmarks/agent-wiring)
before making quantitative comparisons.
