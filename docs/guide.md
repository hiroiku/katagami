# Katagami usage guide and API

## Compatibility

Katagami publishes ESM, CommonJS and TypeScript declarations, with no runtime dependencies.
The CI consumer checks run on Node.js 22 and 24; runtime tests and examples also run with Bun.
The published declarations require TypeScript 5.0 or later. Type examples use TypeScript 5.9,
`strict: true`, and the `ES2022` and `ESNext.Disposable` libraries.
Browser APIs in examples, such as `crypto.randomUUID`, additionally need the `DOM` library.

Core DI does not require decorator compiler flags, metadata emission or polyfills.
The optional disposable entry point uses `Symbol.dispose` / `Symbol.asyncDispose`; the runtime
must supply those symbols. `await using` requires a compiler/runtime that supports or transforms it.
Katagami does not provide those polyfills. `lazy` uses JavaScript `Proxy`.

## Lifetimes

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('shared', () => ({ value: 0 }))
  .registerTransient('fresh', () => ({ value: 0 }))
  .registerScoped('request', () => ({ value: 0 }));

const first = createScope(container);
const second = createScope(container);
first.resolve('shared') === second.resolve('shared'); // true
first.resolve('request') === first.resolve('request'); // true
first.resolve('request') === second.resolve('request'); // false
first.resolve('fresh') === first.resolve('fresh'); // false
```

Factories run when first resolved; transient factories run on each resolution.
Use `createScope(existingScope)` for another scope with its own scoped cache and shared singletons.
Singleton and transient factories cannot directly resolve scoped registrations through their typed resolver.

## Class tokens and async factories

```ts
import { createContainer, createScope } from 'katagami';

class Database {
  query() { return ['Ada']; }
}
class UserService {
  constructor(private db: Database) {}
  list() { return this.db.query(); }
}

const container = createContainer()
  .registerSingleton(Database, async () => new Database())
  .registerScoped(UserService, async r => new UserService(await r.resolve(Database)));

const service = await createScope(container).resolve(UserService);
service.list();
```

Class return types are inferred from constructors. Classes follow TypeScript's structural typing;
see [token identity](./type-safety.md#class-tokens-use-structural-typing).
Async factories produce Promise-typed resolutions. Await them explicitly. A resolution returns the end
of katagami's own bookkeeping chain, not the promise the factory returned. Katagami's bookkeeping and
disposal attach no listener to what it hands out, so a rejected resolution you drop surfaces as an
unhandled rejection, unless a later resolution waits on the same cached promise.

## Composition and test substitution

```ts
import { createContainer, createScope } from 'katagami';

const infrastructure = createContainer()
  .registerSingleton('users', () => ({ find: (id: string) => `user-${id}` }));
const fakeInfrastructure = createContainer()
  .registerSingleton('users', () => ({ find: (id: string) => `fake-${id}` }));

const testContainer = createContainer()
  .use(infrastructure)
  .use(fakeInfrastructure)
  .registerScoped('handler', r => (id: string) => r.resolve('users').find(id));

createScope(testContainer).resolve('handler')('1'); // fake-1
```

`use(source)` copies registration entries and replaces entries for matching tokens. It does not
share the source's singleton cache. Containers are mutable: `register*` and `use` update the container
and return it with accumulated types. Build the composition before creating or resolving scopes.
Preserve each token's value type and lifetime when substituting registrations.

## Optional and multiple resolution

```ts
import { createContainer, createScope } from 'katagami';

const scope = createScope(createContainer()
  .registerSingleton('plugin', () => 'first')
  .registerSingleton('plugin', () => 'second'));

scope.resolve('plugin'); // 'second'
scope.resolveAll('plugin'); // ['first', 'second']
scope.tryResolve('optional'); // undefined
scope.tryResolveAll('optional'); // undefined
```

Repeated `register*` calls accumulate factories for a token. `resolve` selects the last;
`resolveAll` returns an array in registration order. For async factories, the array contains promises;
use `Promise.all`. Keep one consistent value type and lifetime for a token.
`tryResolve` and `tryResolveAll` accept missing tokens intentionally. They still report circular
dependencies and operations on disposed scopes.

## Resource cleanup

```ts
import { createContainer, createScope } from 'katagami';
import { disposable } from 'katagami/disposable';

const container = createContainer().registerScoped('connection', () => ({
  query: () => 'ok',
  [Symbol.dispose]() { console.log('connection closed'); },
}));

{
  await using scope = disposable(createScope(container));
  scope.resolve('connection').query();
} // the scoped connection is disposed here
```

`disposable(containerOrScope)` returns a view with `[Symbol.asyncDispose]()` and hides registration
methods. Disposable scopes retain resolution methods. `createScope` accepts either disposable view
and retains its registered token types.

Scope disposal cleans its cached scoped instances; container disposal cleans its singleton cache.
Instances are processed in reverse cache insertion order, asynchronous results are awaited, and
cleanup errors are combined in an `AggregateError`. A cached asynchronous creation that rejected
yields no resolved value to close: disposal awaits it, skips it, continues with the remaining
instances, and leaves that failure to the caller that resolved the token. Disposal is idempotent.
Transient instances are not cached or automatically owned: arrange their cleanup explicitly.

## Lazy resolution

```ts
import { createContainer, createScope } from 'katagami';
import { lazy } from 'katagami/lazy';

class Report { render() { return 'report'; } }
const scope = createScope(createContainer().registerSingleton(Report, () => new Report()));
const report = lazy(scope, Report);
report.render(); // resolves on first access
```

`lazy` accepts synchronous class tokens on a scope or disposable scope. It does not accept async
or PropertyKey tokens. Core imports do not include the lazy or disposable implementation; these
are separate entry points with `sideEffects: false` for bundlers.

## Predeclared service maps

```ts
import { createContainer, createScope } from 'katagami';

interface Services {
  greeting: string;
  name: string;
}
const container = createContainer<Services>()
  .registerSingleton('greeting', r => `Hello, ${r.resolve('name')}`)
  .registerSingleton('name', () => 'Ada');

createScope(container).resolve('greeting');
```

The first generic defines non-scoped PropertyKey tokens; the second defines scoped PropertyKey tokens.
Maps permit forward references. They do not verify that each declared key has a registration.
Default accumulated registration provides the registration-order checks described in the
[type-safety guide](./type-safety.md).

## API reference

| API | Behavior |
| --- | --- |
| `createContainer<T, ScopedT>()` | Create a registration container; omit type maps to infer them by chaining |
| `registerSingleton(token, factory)` | Register a shared, cached factory |
| `registerTransient(token, factory)` | Register a factory called on every resolution |
| `registerScoped(token, factory)` | Register a factory cached per scope |
| `use(source)` | Copy another container's registrations, replacing matching token entries |
| `createScope(source)` | Create a scope from a container, scope or disposable view |
| `createContainer({ policy })` | Share a policy's settings and observed origins among containers given the same policy object |
| `ContainerPolicy` (type export) | Check a policy with `satisfies` while keeping its hook and required-key types |
| `policy.requiredMetadata` | Require metadata keys on every registration and in `.use()` |
| `createMetadataKey<T>()(name)` | Define a typed metadata key |
| `{ metadata: [KEY(value)] }` (third registration argument) | Declare registration metadata next to the factory |
| `container.getMetadata(token)` | Read the last registration's metadata without creating the service |
| `entrypoint(factory)` | Mark a factory that returns a function as a public operation |
| `beforeResolve(event)` (scope option) | Check a registration synchronously just before it is resolved, including cache hits |
| `policy.beforeReturn({ registrations })` | Synchronously check the observed origins of values returned by top-level resolution and of operations' direct results; resolutions requested by factories are not checked |
| `createScope(source, { access: 'operations' })` | Create a new scope whose `get(token)` returns public operations and whose disposal waits for running calls |
| `operations.get(token)(...args)` | Create nothing on `get`; resolve, run and check the operation on each call. The result is always a Promise |
| `scope.resolve(token)` | Resolve the last registration; fail if missing |
| `scope.resolveAll(token)` | Resolve every registration for a token |
| `scope.tryResolve(token)` | Resolve the last registration or return `undefined` |
| `scope.tryResolveAll(token)` | Resolve all registrations or return `undefined` |
| `disposable(source)` from `katagami/disposable` | Add async cleanup and return a restricted view |
| `lazy(scope, classToken)` from `katagami/lazy` | Defer synchronous resolution until first access |
| `ContainerError` | Runtime error for missing registrations, cycles and invalid scope operations |
| `Resolver` (type export) | Factory resolver type; retain inferred generics when extracting factories |

## Registration policies and operations

See [registration policies and operations](./registration-policies.md) for the shared `policy`, required
metadata, `beforeResolve`, `beforeReturn`, `entrypoint` and operations scopes. Get a public operation
with `createScope(container, { access: 'operations' }).get(name)`; the function it returns resolves its
dependencies when called and always returns a Promise. Pass the same `policy` object to every module
that follows the policy, and assemble them with ordinary lifetimes and `.use()`. A value the policy
forbids does not leave through top-level resolution or an operation result, as long as it is an object
or function whose origin can be tracked.

`beforeResolve` checks resolutions in the scope that owns the resolver. It does not rebind a shared
singleton's resolver to its caller, and it does not re-check values that were already obtained. Use
scoped registrations for work that depends on the request or its permissions.
