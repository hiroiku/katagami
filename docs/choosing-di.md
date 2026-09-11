# Choosing a TypeScript dependency injection approach

Katagami is a strong fit when you want **registration-derived types, explicit request scopes and
ordinary TypeScript factories without decorators or runtime dependencies**. The
[README comparison](../README.md#library-comparison) covers all eight libraries, including their
typing, setup, lifetimes, asynchronous behavior and cleanup. This guide records the evidence and
the features that need more explanation than a table cell.

## What distinguishes Katagami

The default registration chain accumulates the tokens visible to each factory. With literal keys
or unique symbols preserved, a missing required token is rejected before execution. Singleton and
transient factories receive a resolver that excludes scoped tokens. Async results stay visible as
Promises. This combination gives a coding agent actionable TypeScript errors while keeping the
wiring in ordinary factory functions.

Accumulation alone is not unique to Katagami: typed-inject checks accumulated tokens and injection
tuples, and Awilix 13 infers cradle types from registrations. Effect tracks required services in its
effect and layer types. Katagami adds a specific scope restriction to its factory resolver API.
See [the guarantee examples](./type-safety.md) for narrow-token requirements, structural class
typing, mutable aliases and predeclared-map boundaries.

| Approach | A reason to choose it |
| --- | --- |
| Ordinary constructor/function parameters | Few dependencies; direct wiring remains easy to maintain |
| Katagami | Registration checks and explicit scoped DI in standard TypeScript factories |
| InversifyJS | Class-oriented binding, contextual constraints, container modules and snapshots |
| tsyringe | Constructor injection with decorators, child containers and resolution interceptors |
| TypeDI | An existing application built around its decorators, typed tokens and named containers |
| Awilix | Proxy/classic injection, inferred cradles, module loading and runtime lifetime checks |
| NestJS | The app already benefits from Nest modules, request handling and framework integrations |
| Effect | Service composition belongs with typed errors, effectful execution and scoped resources |
| typed-inject | Accumulated string-token checks with explicit injection tuples and child injectors |

## Comparison sources

Reviewed **2026-09-11**. Competitor versions are the npm `latest` dist-tag versions observed on that date,
not prerelease versions or unreleased features from repository default branches. TypeDI refers to
the `typedi` package maintained under TypeStack, not similarly named forks. NestJS's version is
the version of `@nestjs/core`. The comparison uses Effect **3** documentation explicitly. Katagami 3.0.2 is this documentation
release; its runtime and public APIs are unchanged from the reviewed 3.0.1 package.

| Package | Reviewed version and registry metadata | Primary documentation / shipped API |
| --- | --- | --- |
| Katagami | [3.0.1](https://registry.npmjs.org/katagami/3.0.1) | [Type guarantees](./type-safety.md), [API guide](./guide.md) |
| InversifyJS | [8.2.3](https://registry.npmjs.org/inversify/8.2.3) | [8.x setup](https://inversify.io/docs/introduction/getting-started/), [bindings](https://inversify.io/docs/fundamentals/binding/), [container API](https://inversify.io/docs/api/container/) |
| tsyringe | [4.10.0](https://registry.npmjs.org/tsyringe/4.10.0) | [Release README](https://github.com/microsoft/tsyringe/blob/e033769d97cfb6cc4a8569e2b50eb32015453302/README.md), [container types](https://github.com/microsoft/tsyringe/blob/e033769d97cfb6cc4a8569e2b50eb32015453302/src/types/dependency-container.ts) |
| TypeDI | [0.10.0](https://registry.npmjs.org/typedi/0.10.0) | [Release source](https://github.com/typestack/typedi/tree/v0.10.0), [container implementation](https://github.com/typestack/typedi/blob/v0.10.0/src/container-instance.class.ts) |
| Awilix | [13.0.5](https://registry.npmjs.org/awilix/13.0.5) | [Release README](https://github.com/jeffijoe/awilix/blob/f72d175ddb950c3f13ef41e8be98b24471d59900/README.md), [container types/implementation](https://github.com/jeffijoe/awilix/blob/f72d175ddb950c3f13ef41e8be98b24471d59900/src/container.ts) |
| NestJS | [12.0.1](https://registry.npmjs.org/@nestjs%2fcore/12.0.1) | [Providers](https://docs.nestjs.com/fundamentals/custom-providers), [scopes](https://docs.nestjs.com/fundamentals/injection-scopes), [async providers](https://docs.nestjs.com/fundamentals/async-providers), [lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events) |
| Effect | [3.22.2](https://registry.npmjs.org/effect/3.22.2) | [v3 layers](https://effect.website/docs/v3/requirements-management/layers), [v3 scope](https://effect.website/docs/v3/resource-management/scope) |
| typed-inject | [5.0.0](https://registry.npmjs.org/typed-inject/5.0.0) | [Release README](https://github.com/nicojs/typed-inject/blob/5d3c0276e65ade1d683239346488708b7a11e443/README.md), [injector types](https://github.com/nicojs/typed-inject/blob/5d3c0276e65ade1d683239346488708b7a11e443/src/api/Injector.ts) |

Versioned npm tarballs were also inspected. A focused TypeScript 5.9.3 check confirmed that
Awilix 13.0.5 infers registered cradle properties and rejects an unknown cradle property, while
`resolve('missing')` still compiles through its broad overload. The same check confirmed that
typed-inject 5.0.0 and Katagami 3.0.1 reject an unknown literal token, and that Awilix and
typed-inject infer a Promise returned by a factory. This is a type check, not a performance benchmark
or an exhaustive runtime compatibility test.

## Reading the comparison

### Registration types and scope restrictions

A typed return value is different from proving that the container has a registration. InversifyJS,
tsyringe and TypeDI expose class/generic-token APIs without accumulating the set of registered keys
into the container's type. Awilix has both inferred cradle access and a broad string/symbol `resolve`
overload. Its opt-in strict mode checks lifetime leaks at runtime. These observations come from the
published APIs linked above, not from treating all of these libraries as “untyped.”

NestJS handles request-scoped dependencies by propagating request scope up the dependency chain.
That is a different policy from Katagami rejecting scoped access in a singleton factory. Effect's
`Scope` requirement ensures resource acquisition has a scope; it does not use Katagami's
singleton/transient/scoped categories. typed-inject has disposable child injectors, but its provider
scope enum offers singleton and transient, not a separate scoped registration policy.

### Setup and bundles

Katagami, Awilix, Effect and typed-inject do not require decorator metadata for their DI APIs.
The documented TypeScript class-injection paths for InversifyJS, tsyringe and TypeDI use metadata;
explicit factory/value bindings should not be described as requiring decorators on every service.
NestJS provides framework modules and metadata-based injection as well as custom providers.

Katagami and typed-inject have no runtime dependency packages. TypeDI's manifest also has no
`dependencies`, but its TypeScript setup asks the application to install `reflect-metadata`.
Awilix's Node package lists `fast-glob`; its browser build excludes filesystem-based module loading.
“No decorators” therefore does not mean “no dependency packages.”

Katagami publishes ESM, CommonJS, subpath exports and `sideEffects: false`. Effect also exposes
ESM/subpath exports and a side-effect declaration, and TypeDI declares `sideEffects: false`.
The other libraries should not receive an automatic “no tree shaking” mark. Actual output size
depends on the entry point, imports, bundler and application; no comparative bundle-size benchmark
was run for this table.

### Async and cleanup

Katagami exposes `Promise<T>` for async factories: dependent factories explicitly await that value.
Awilix, typed-inject and the generic factory/value APIs in tsyringe and TypeDI can also carry a
Promise-valued service. This is different from InversifyJS's async resolution or NestJS's async
providers, which await dependencies before constructing their consumers. Effect models acquisition
as an effect. A binary “async factories: no” would conceal these distinctions.

Katagami's `disposable()` owns container singletons or scope instances and calls disposal-symbol
methods. Its [compatibility requirements](./guide.md#compatibility) still apply. InversifyJS has
[singleton deactivation handlers](https://inversify.io/docs/fundamentals/lifecycle/deactivation/); tsyringe and typed-inject support disposable constructed instances;
Awilix disposes cached scoped/singleton values through registered disposers. TypeDI can call
`destroy()` during reset/removal but does not await its return. NestJS's application lifecycle hooks
are not invoked for request-scoped classes. Effect scopes run registered finalizers. These are
different ownership and shutdown models, not interchangeable cleanup guarantees.

## Composition and tooling

This table restores the broader feature comparison using concrete APIs. “Compose” means ordinary
application code can implement the pattern; it does not claim a dedicated container feature.

| Library | Optional / multiple resolution | Composition, discovery and extension |
| --- | --- | --- |
| Katagami | `tryResolve`, `resolveAll`, `tryResolveAll` | `use()` copies registrations; opt-in `lazy()`; ordinary higher-order factories |
| InversifyJS | Optional get/inject, `getAll`, `getAllAsync` | Container modules/hierarchy, autobinding, contextual constraints, activation/deactivation, snapshot/restore |
| tsyringe | Optional inject, `injectAll`, `resolveAll` | `@registry`, child containers, before/after resolution interceptors, `delay()` |
| TypeDI | `has` before `get`; `getMany` with multiple registrations | Named containers, factory configuration and service decorators |
| Awilix | `allowUnregistered`; compose collections as values/factories | `loadModules`, child scopes, local injections and proxy/classic injection |
| NestJS | Optional injection/provider dependencies; compose array providers | Modules/dynamic modules, provider overrides, discovery service and lazy modules |
| Effect | [`serviceOption`](https://effect.website/docs/v3/requirements-management/services#optional-services); compose collection-valued services | Layer composition, service substitution and scoped acquisition |
| typed-inject | Required tokens checked statically; compose optional values/collections | Child injectors, provider replacement/decoration and explicit injection tuples |

Katagami does not implement filesystem auto-discovery or snapshot/restore, and its runtime
containers are mutable. `use()` and fresh test containers provide explicit composition and test
substitution. Factory wrappers are an application pattern, not a middleware/interceptor API.
Similarly, a lazy module loader is not the same feature as a proxy that constructs one service on
first property access, and a resolution graph scope is not an HTTP request scope.

Start with the [runnable starter](../examples/request-scope/README.md) and
[composition guide](./guide.md#composition-and-test-substitution). For a project already built on
NestJS or Effect, adopting its existing DI model can be simpler than maintaining a second container.

## Updating the comparison

Preserve a comparison and Katagami's supported advantages in the README when editing positioning.
Refresh the date, npm dist-tag versions and official sources together. Check published declarations
when a claim involves inference or registration guarantees, and distinguish built-in features from
wrappers, configuration and framework behavior. Keep localized summaries aligned with the English
comparison. Do not infer a feature's absence from its omission in a quick-start guide.
