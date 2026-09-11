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

## Why Katagami

Katagami combines **registration-derived types, compile-time scope restrictions and zero runtime
dependencies** in an ordinary TypeScript factory API.

- **Types grow with your registrations.** Literal keys and unique symbols carry their inferred
  service types into subsequent factories; required tokens outside that set are compile-time errors.
- **Request state stays explicit.** Singleton and transient factories cannot resolve scoped tokens
  through their supplied typed resolver. You can find this mistake before starting the application.
- **No decorator setup.** No `experimentalDecorators`, `emitDecoratorMetadata` or Reflect polyfill
  is needed for DI. Constructors and factories stay ordinary TypeScript.
- **Import the capabilities you use.** Core DI, `katagami/disposable` and `katagami/lazy` are separate
  entry points. ESM exports and `sideEffects: false` support tree shaking; optional cleanup integrates
  with `await using` and the host's disposal symbols.

These checks assume narrow tokens and preserved registration types; see the
[class-token, mutation and predeclared-map boundaries](./docs/type-safety.md).

### Library comparison

Reviewed **2026-09-11**, against the npm `latest` versions below and official documentation.
The tables describe the built-in APIs; add-ons and application-specific wrappers can change the
trade-offs. [Version sources and detailed comparison notes](./docs/choosing-di.md#comparison-sources)
explain the distinctions.

| Library / reviewed version | Dependency typing and missing registrations | Scoped-dependency handling | DI setup |
| --- | --- | --- | --- |
| **Katagami 3.0.2** | **Accumulated literal/unique-symbol tokens; missing required tokens rejected** | **Scoped tokens excluded from singleton/transient factory resolvers** | **No decorators or metadata; zero runtime dependencies** |
| [InversifyJS 8.2.3](https://inversify.io/docs/fundamentals/binding/) | Typed identifiers and bindings; binding existence checked at runtime | Declared binding scopes; not a scope-filtered resolver type | Metadata-based class injection; explicit value/factory bindings also available |
| [tsyringe 4.10.0](https://github.com/microsoft/tsyringe#readme) | Class/generic resolution types; registrations checked at runtime | Runtime lifetime settings; factory receives the container | Decorators and a Reflect metadata polyfill for class injection |
| [TypeDI 0.10.0](https://github.com/typestack/typedi/tree/v0.10.0) | Class and `Token<T>` types; registrations checked at runtime | Shared/transient services and named containers | Decorators and `reflect-metadata` in the TypeScript setup |
| [Awilix 13.0.5](https://github.com/jeffijoe/awilix#readme) | Registration-derived cradle types; broad `resolve` overload still accepts unknown names | `strict: true` checks lifetime leaks at runtime | No decorators or metadata |
| [NestJS 12.0.1](https://docs.nestjs.com/fundamentals/custom-providers) | Typed providers; module/provider graph resolved at runtime | Request scope propagates to dependent providers | Framework modules and metadata-based class injection |
| [Effect 3.22.2](https://effect.website/docs/v3/requirements-management/layers) | Service requirements tracked in `Effect` / `Layer` types | Typed `Scope` requirements and resource finalizers; a different lifetime model | No decorators or metadata; Effect's service/layer model |
| [typed-inject 5.0.0](https://github.com/nicojs/typed-inject#readme) | Accumulated string tokens and checked `inject` tuples | Singleton/transient providers and child injectors; no separate scoped lifetime | No decorators or metadata; zero runtime dependencies |

Awilix's inferred `cradle` and typed-inject's registration types are real compile-time features.
Katagami's distinction is the combination of accumulated registration checks with **scope-filtered
factory resolvers**, using direct `r.resolve(token)` calls. Effect also checks unsatisfied service
requirements, within its broader effect and resource model.

| Library | Lifetimes / scope model | Asynchronous services | Resource cleanup |
| --- | --- | --- | --- |
| **Katagami** | **Singleton, transient, scoped; nested scopes** | **Inferred `Promise<T>`; explicitly await dependencies** | **`Symbol.dispose` / `Symbol.asyncDispose` via `disposable()`; `await using`** |
| InversifyJS | Singleton, transient, request (one resolution graph); container hierarchy | Async bindings via `getAsync` / `getAllAsync`; awaits dependencies | Singleton deactivation handlers |
| tsyringe | Singleton, transient, resolution-scoped, container-scoped | Factories can return Promise-valued services; consumer handles the Promise | `container.dispose()` for constructed disposable instances |
| TypeDI | Shared or transient services; named containers | Promise-valued services; consumer handles the Promise | `reset()` / removal can call `destroy()`; returned Promise is not awaited |
| Awilix | Singleton, transient, scoped | Promise-valued factories; consumer handles the Promise | Registered disposers for cached singleton/scoped values |
| NestJS | Singleton, transient, HTTP request; scope propagation | Async providers are awaited before dependent construction | Application lifecycle hooks; not called for request-scoped classes |
| Effect | Memoized layers and explicit resource scopes | Effectful acquisition, including async effects | Scope finalizers and `acquireRelease` |
| typed-inject | Singleton, transient; disposable child injectors | Promise-valued factories with inferred return types | `injector.dispose()` awaits owned instances' `dispose()` |

“Request” is not identical across libraries: InversifyJS uses a resolution graph, while NestJS can
use an HTTP request. Katagami and Awilix let you create an explicit scope per request.
Returning a Promise and automatically awaiting dependencies are also different capabilities.
See [composition, optional/multiple resolution and tooling](./docs/choosing-di.md#composition-and-tooling)
for the rest of the feature comparison.

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
