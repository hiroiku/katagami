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

**27 features across eight libraries.** Reviewed **2026-09-11**, against the npm `latest`
versions shown below and official documentation. [Versions, sources and detailed notes](./docs/choosing-di.md#comparison-sources).

**✅ Built-in support · ⚠️ Conditions, a different model or application composition · ➖ No built-in support for this specific capability.**
Short labels identify the actual API or limitation.

#### Type safety and setup

| Feature | **Katagami**<br>**3.0.3** | InversifyJS<br>8.2.3 | tsyringe<br>4.10.0 | TypeDI<br>0.10.0 | Awilix<br>13.0.5 | NestJS<br>12.0.1 | Effect<br>3.22.2 | typed-inject<br>5.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Runtime requirements** | **✅ Standard TypeScript** | ⚠️ Reflect metadata for class DI | ⚠️ Reflect metadata for class DI | ⚠️ Reflect metadata setup | ✅ No DI metadata | ⚠️ Nest modules / metadata | ✅ Effect / Layer APIs | ✅ Standard TypeScript |
| **Injection style** | **Explicit factories / constructors** | Constructor / property / factory | Constructor / factory | Constructor / property / factory | Proxy / classic / factory | Constructor / property / factory | Functional services / layers | Constructor / factory + `inject` |
| **Token types** | **Class / string / number / symbol** | Class / string / symbol | Class / string / symbol | Class / string / `Token<T>` | String / symbol | Class / string / symbol | `Context.Tag` | String literals |
| **Type safety** | **✅ Inferred services + scope checks** | ✅ Typed identifiers / bindings | ✅ Class / generic types | ✅ Class / `Token<T>` | ✅ Inferred cradle | ✅ Typed providers | ✅ Typed service requirements | ✅ Tokens + `inject` tuples |
| **Registration-derived types** | **✅ Accumulated tokens** | ➖ | ➖ | ➖ | ✅ `register` → cradle | ➖ | ⚠️ Layer requirements | ✅ Accumulated tokens |
| **Missing required tokens: compile-time check¹** | **✅ Literal / unique-symbol keys** | ➖ Runtime check | ➖ Runtime check | ➖ Runtime check | ⚠️ Cradle only | ➖ Runtime graph | ✅ Unsatisfied requirements | ✅ Literal keys |
| **Scoped access from singleton/transient factories: compile-time check¹** | **✅ Scoped tokens excluded** | ➖ | ➖ | ➖ | ⚠️ Runtime strict mode | ⚠️ Request-scope propagation | ⚠️ Different `Scope` model | ➖ No scoped lifetime |
| **Zero runtime dependency packages²** | **✅** | ➖ | ➖ | ⚠️ Reflect polyfill installed separately | ⚠️ Browser entry differs | ➖ | ➖ | ✅ |
| **Tree-shaking support²** | **✅ ESM / subpaths / `sideEffects: false`** | ⚠️ ESM; `sideEffects: true` | ⚠️ ESM build | ✅ ESM / `sideEffects: false` | ⚠️ ESM / browser builds | ⚠️ ESM / framework setup | ✅ ESM / subpaths / side-effect declaration | ⚠️ ESM build |

#### Lifetimes, async services and cleanup

| Feature | **Katagami**<br>**3.0.3** | InversifyJS<br>8.2.3 | tsyringe<br>4.10.0 | TypeDI<br>0.10.0 | Awilix<br>13.0.5 | NestJS<br>12.0.1 | Effect<br>3.22.2 | typed-inject<br>5.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Lifetimes** | **✅ Singleton / Transient / Scoped** | ✅ Singleton / Transient / Request | ✅ Singleton / Transient / Resolution / Container | ✅ Shared / Transient | ✅ Singleton / Transient / Scoped | ✅ Singleton / Transient / Request | ⚠️ Memoized / fresh layers + scopes | ✅ Singleton / Transient |
| **Request / scoped lifetime³** | **✅ Explicit per-request scope** | ⚠️ One resolution graph | ✅ Container / resolution scoped | ⚠️ Named containers | ✅ Explicit per-request scope | ✅ HTTP request scope | ⚠️ Resource scopes | ⚠️ Child injectors; no Scoped provider |
| **Child containers / nested scopes³** | **✅ Nested scopes** | ✅ Container hierarchy | ✅ Child containers | ⚠️ Named containers | ✅ Child scopes | ⚠️ Module / request contexts | ⚠️ Nested resource scopes | ✅ Child injectors |
| **Async factories** | **✅ Promise-valued factories** | ✅ Async bindings | ✅ Promise-valued factories | ✅ Promise-valued services | ✅ Promise-valued factories | ✅ Async providers | ✅ Effectful acquisition | ✅ Promise-valued factories |
| **Async result type tracking** | **✅ Inferred `Promise<T>`** | ✅ `getAsync<T>` | ⚠️ Promise-valued service type | ⚠️ Promise-valued service type | ✅ Inferred `Promise<T>` | ⚠️ Provider / consumer types | ✅ Effect result / error / requirements | ✅ Inferred `Promise<T>` |
| **Automatically await async dependencies⁴** | **➖ Explicit `await`** | ✅ `getAsync` / `getAllAsync` | ➖ Consumer awaits | ➖ Consumer awaits | ➖ Consumer awaits | ✅ Before consumer construction | ✅ Effect composition | ➖ Consumer awaits |
| **Resource cleanup⁵** | **✅ Disposal symbols / `await using`** | ⚠️ Singleton deactivation | ✅ Constructed disposables | ⚠️ `destroy()` on reset / removal | ⚠️ Cached values + disposer | ⚠️ App lifecycle hooks | ✅ Scope finalizers | ✅ Owned disposable instances |
| **Await asynchronous cleanup⁵** | **✅ `Symbol.asyncDispose`** | ✅ Async deactivation | ✅ `container.dispose()` | ➖ `destroy()` is not awaited | ✅ `container.dispose()` | ⚠️ App hooks; not request-scoped classes | ✅ Effect finalizers | ✅ `injector.dispose()` |

#### Composition and advanced features

| Feature | **Katagami**<br>**3.0.3** | InversifyJS<br>8.2.3 | tsyringe<br>4.10.0 | TypeDI<br>0.10.0 | Awilix<br>13.0.5 | NestJS<br>12.0.1 | Effect<br>3.22.2 | typed-inject<br>5.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Optional resolution** | **✅ `tryResolve` / `tryResolveAll`** | ✅ Optional get / inject | ✅ Optional injection | ⚠️ `has` then `get` | ✅ `allowUnregistered` | ✅ Optional injection | ✅ `serviceOption` | ⚠️ Compose optional values |
| **Multi-binding** | **✅ `resolveAll`** | ✅ `getAll` / `getAllAsync` | ✅ `injectAll` / `resolveAll` | ✅ `getMany` | ⚠️ Collection-valued service | ⚠️ Array provider | ⚠️ Collection-valued service | ⚠️ Collection-valued service |
| **Lazy resolution⁶** | **✅ `lazy()`; sync class tokens** | ⚠️ Deferred identifiers / factories | ✅ `delay()` proxy | ⚠️ Deferred type reference | ⚠️ Cradle property access | ⚠️ `LazyModuleLoader` | ⚠️ Lazy effect execution | ⚠️ Inject a factory |
| **Conditional bindings** | **⚠️ Tokens / factory logic** | ✅ Contextual constraints | ✅ Predicate-aware factory | ⚠️ Factory logic | ⚠️ Local injection / factory logic | ⚠️ Dynamic modules / factories | ⚠️ Select / compose layers | ⚠️ Factory logic |
| **Auto-loading / discovery⁶** | **➖ Explicit `use()`** | ⚠️ Class autobinding | ➖ Explicit registrations | ➖ Explicit imports | ✅ `loadModules` (Node) | ⚠️ `DiscoveryService` | ➖ Explicit layers | ➖ Explicit providers |
| **Module system / composition** | **✅ `use()`** | ✅ Container modules | ✅ `@registry` | ⚠️ Group registrations | ✅ `loadModules` / `register` | ✅ Modules / dynamic modules | ✅ Layer composition | ⚠️ Compose provider chains |
| **Circular dependency detection⁷** | **✅ Runtime cycle path** | ✅ Runtime detection | ⚠️ Constructor error / `delay` | ⚠️ Deferred type references | ✅ Runtime cycle path | ⚠️ Cycle errors / `forwardRef` | ⚠️ Typed Layer requirements | ⚠️ Registration order constrains dependencies |
| **Middleware / interceptors⁶** | **⚠️ Higher-order factories** | ✅ Activation / deactivation hooks | ✅ Before / after resolution | ⚠️ Factory wrappers | ⚠️ Factory wrappers | ⚠️ Request interceptors, not DI hooks | ⚠️ Effect composition | ⚠️ Provider decoration |
| **Snapshot / restore⁶** | **➖** | ✅ `snapshot` / `restore` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Test substitution / isolation** | **✅ Fresh scopes / containers + `use()`** | ✅ Rebind / snapshots | ✅ Child container overrides | ✅ Named containers / reset | ✅ Child scopes / overrides | ✅ `overrideProvider` | ✅ Substitute test layers | ✅ Child injector overrides |

**What stands out:** Katagami combines **accumulated registration types, scope-filtered factory
resolvers, three lifetimes and zero runtime dependencies** with direct `r.resolve(token)` calls.
Optional/multiple resolution, module composition, lazy class resolution and standards-based cleanup
stay available without decorator setup. Awilix, Effect and typed-inject also provide meaningful
compile-time checks, as shown above.

<details>
<summary>Comparison notes: type guarantees, scopes, async behavior and feature boundaries</summary>

1. **Type guarantees:** Katagami's missing-token guarantee applies to accumulated literal keys and
   unique symbols with their types preserved. Class tokens, predeclared maps and mutable aliases
   have [documented boundaries](./docs/type-safety.md). Awilix rejects unknown cradle properties,
   but its broad `resolve` overload accepts unknown names. Effect checks service requirements in
   its own model. Scope checks here mean excluding scoped tokens from singleton/transient resolvers.
2. **Setup and bundles:** Metadata notes describe the documented class-injection path; explicit
   value/factory bindings can avoid decorating individual services. Core Katagami needs no polyfills;
   disposal has [host/compiler requirements](./docs/guide.md#compatibility). ESM and side-effect
   declarations help tree shaking, but these are packaging comparisons, not measured bundle sizes.
3. **Scopes:** InversifyJS Request means one resolution graph, not an HTTP request. Named containers,
   module contexts, child injectors and Effect resource scopes are not identical lifetime policies.
4. **Async:** Returning a Promise is distinct from awaiting dependencies before injection.
   Katagami keeps the Promise in the inferred type and leaves `await` explicit.
5. **Cleanup:** Katagami's opt-in `disposable()` integrates `Symbol.dispose`, `Symbol.asyncDispose`
   and `await using`. Ownership varies by library; InversifyJS deactivation is for singletons,
   Awilix disposers are for cached values, and Nest hooks exclude request-scoped classes.
6. **Composition versus dedicated APIs:** A service proxy, deferred token and lazy module are
   different features. Autobinding/discovery is not filesystem loading. Katagami's `use()` copies
   registrations; containers are mutable. Factory wrappers are not interceptor APIs, and fresh
   containers are not snapshots. [Composition details](./docs/choosing-di.md#composition-and-tooling).
7. **Cycles:** Runtime cycle detection, deferred references and static dependency requirements are
   different mechanisms. A ⚠️ entry does not promise a general cycle detector; runtime checks do
   not imply detection of every asynchronous deadlock.

</details>

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

- [登録の属性と公開操作](./docs/registration-policies.ja.md): 必須 metadata、解決 hook、callable の公開と scope の終了。

`beforeResolve` は resolver が所属する scope の解決を検査します。共有した singleton の resolver を呼出者へ再束縛したり、取得済み値の権限を推移的に再検証したりするものではありません。要求・権限に依存する処理には scoped を使ってください。

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
