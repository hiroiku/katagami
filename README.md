[English](./README.md) | [日本語](./docs/README.ja.md) | [한국어](./docs/README.ko.md) | [繁體中文](./docs/README.zh-TW.md) | [简体中文](./docs/README.zh-CN.md) | [Español](./docs/README.es.md) | [Deutsch](./docs/README.de.md) | [Français](./docs/README.fr.md)

# Katagami

**Type-safe dependency injection for TypeScript.**

Make dependency wiring explicit and type-checked—even when AI coding agents write the code.
Katagami accumulates types as you register dependencies, checks which tokens a factory can access,
and tracks asynchronous results. No decorators, no reflect-metadata, no runtime dependencies.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![CI](https://github.com/hiroiku/katagami/actions/workflows/ci.yml/badge.svg)](https://github.com/hiroiku/katagami/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)

```sh
npm install katagami
```

## Quick start

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('logger', () => ({ log: (message: string) => console.log(message) }))
  .registerScoped('greeting', r => {
    const logger = r.resolve('logger'); // Inferred from the previous registration
    return (name: string) => logger.log(`Hello, ${name}!`);
  });

const scope = createScope(container);
scope.resolve('greeting')('world');
// scope.resolve('missing'); // Type error: this token has not been registered
```

No service interface or explicit generic argument is needed here. Literal string keys,
unique symbols and class tokens can all be used. See [type guarantees](./docs/type-safety.md)
for the difference between accumulated registrations and a predeclared type map.

## Why Katagami for AI-assisted development?

Give coding agents a concrete feedback loop: edit dependency wiring, run the TypeScript checker,
and use the diagnostics to fix invalid dependencies. Explicit factories keep dependency edges
in ordinary TypeScript code that both people and agents can read.

For example, a singleton must not capture state that belongs to one request:

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — a singleton factory cannot resolve this scoped token
  .registerSingleton('handler', r => r.resolve('request'));
```

The compiler reports `No overload matches this call` at `r.resolve('request')`.
The factory's resolver does not include scoped tokens. Give the handler the same lifetime as the request:

```ts
import { createContainer } from 'katagami';

const container = createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  .registerScoped('handler', r => r.resolve('request'));
```

The `@ts-expect-error` above makes the deliberately invalid example a checked regression test.
In application code, fix the lifetime and run `npx tsc --noEmit`; do not add a suppression.
These examples prove specific compiler checks. Improvements in agent success rate or token usage
have not been measured; the [evaluation protocol](https://github.com/hiroiku/katagami/tree/master/benchmarks/agent-wiring)
describes how to test them.

**Start here:** [Guide for AI coding agents](./docs/ai-coding-agents.md) ·
[Runnable request-scope starter](./examples/request-scope/README.md) ·
[Type safety and its boundaries](./docs/type-safety.md)

## What you get

| Capability | Practical use |
| --- | --- |
| Accumulated registration types | Resolve registered literal tokens with inferred return types |
| Scope-aware factory resolvers | Detect direct access to scoped dependencies from singleton/transient factories |
| Async type tracking | Keep `Promise` results visible to the compiler |
| Singleton, transient and scoped lifetimes | Share infrastructure and isolate request state |
| Explicit factories and `use()` composition | Group registrations and replace infrastructure in tests |
| Class, string, number and symbol tokens | Choose the token style that fits your application |
| Optional and multiple resolution | Use `tryResolve`, `resolveAll` and `tryResolveAll` |
| Resource cleanup and lazy resolution | Opt in through `katagami/disposable` and `katagami/lazy` |
| ESM, CommonJS and zero runtime dependencies | Use standard tooling without decorator metadata setup |

Use Katagami when dependency wiring, test substitution or request lifetimes need structure.
For a few dependencies, ordinary constructor/function parameters may be enough.
See [choosing a DI approach](./docs/choosing-di.md) for trade-offs and links to alternatives.

## Documentation

- [Usage guide and API](./docs/guide.md): lifetimes, composition, classes, async factories, cleanup and lazy resolution.
- [Type guarantees](./docs/type-safety.md): accumulated tokens, interface maps and structural class typing.
- [AI coding guide](./docs/ai-coding-agents.md): workflow, diagnostics and a prompt to use in your project.
- [Request-scope starter](./examples/request-scope/README.md): concurrent requests, fake repositories and cleanup.
- [AI-assisted dependency wiring](./docs/articles/ai-coding-agents.md): a worked example.
- [Request-scope mistakes](./docs/articles/request-scope.md): identifying and fixing a captive dependency.
- [DI without decorators](./docs/articles/without-decorators.md): installation and test substitution.
- [Contributing](https://github.com/hiroiku/katagami/blob/master/CONTRIBUTING.md) and [changelog](https://github.com/hiroiku/katagami/blob/master/CHANGELOG.md).

TypeScript examples use strict type checking. Core DI needs no polyfills. Optional resource
cleanup requires the host's disposal symbols; `await using` also requires suitable TypeScript
compiler/lib settings. See the [compatibility notes](./docs/guide.md#compatibility).

## About the name

型紙 (*katagami*) is stencil paper used in traditional Japanese dyeing.
Layered stencils compose a pattern, just as registrations accumulate types in a method chain.

## License

MIT
