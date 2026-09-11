# Type-safe dependency injection: what Katagami checks

Katagami's default `createContainer()` accumulates types from registrations. With literal keys
or unique symbols preserved, a resolver can only accept tokens accumulated into its visible
registration set. No separate service interface is required. Run TypeScript with `strict: true`.

## Accumulated registrations

```ts
import { createContainer, createScope } from 'katagami';

const DATABASE = Symbol('database');
const OTHER_DATABASE = Symbol('database');
const container = createContainer()
  .registerSingleton(DATABASE, () => ({ query: () => 'ok' }))
  .registerSingleton('greeting', () => 'hello');

const scope = createScope(container);
const greeting: string = scope.resolve('greeting');
scope.resolve(DATABASE).query();
// @ts-expect-error — this literal key has not been accumulated
scope.resolve('missing');
// @ts-expect-error — the same description does not make two symbols identical
scope.resolve(OTHER_DATABASE);
```

Inside a factory, the visible set is the set accumulated **before that registration**.
Singleton and transient factories receive the non-scoped set. Scoped factories receive both sets.
Scopes can resolve both. `use()` includes the source module's registration types.
`disposable()` and nested scopes retain the registration state, including asynchronous results.

| Pattern | Compile-time behavior |
| --- | --- |
| Unregistered literal key / distinct unique symbol in accumulated mode | Rejected |
| A structurally incompatible, unregistered class | Rejected |
| Scoped literal token in a singleton or transient factory | Rejected |
| Accessing a service method on an unresolved `Promise<Service>` | Rejected |
| A key declared in `createContainer<Services>()`, but never registered | Accepted; runtime resolution can fail |
| An unregistered class structurally compatible with a registered class | Can be accepted; runtime resolution can fail |
| `tryResolve` of an unregistered token | Intentionally accepted; absence is a normal result |

The checked examples and regression tests establish these specific behaviors. They do not prove
arbitrary program correctness or an improvement in AI coding performance.

## Class tokens use structural typing

Accumulating a class type does not give TypeScript a nominal identity for each constructor.
The following compiles in accumulated mode, but throws `ContainerError` if executed:

```ts
import { createContainer, createScope } from 'katagami';

class Registered { value = 1; }
class NotRegistered { value = 1; }

const scope = createScope(createContainer()
  .registerSingleton(Registered, () => new Registered()));

scope.resolve(NotRegistered); // Same structure to TypeScript; different runtime Map key
```

This includes empty classes and can include subclasses. TypeScript checks compatibility;
the runtime registry checks token identity. When that distinction matters, use unique symbols
or literal keys, or distinguish class types with separate private member declarations:

```ts
import { createContainer, createScope } from 'katagami';

class Registered {
  declare private brand: undefined;
  value = 1;
}
class NotRegistered {
  declare private brand: undefined;
  value = 1;
}

const scope = createScope(createContainer()
  .registerSingleton(Registered, () => new Registered()));
// @ts-expect-error — these separately declared private members make the types incompatible
scope.resolve(NotRegistered);
```

See [TypeScript's type compatibility documentation](https://www.typescriptlang.org/docs/handbook/type-compatibility).

## Predeclared interface maps

`createContainer<Services>()` starts with the declared keys already visible. This enables
order-independent registration, but that type map is a declaration of intent, not a proof
that every key has a runtime factory:

```ts
import { createContainer, createScope } from 'katagami';

interface Services { greeting: string; }
const scope = createScope(createContainer<Services>());
scope.resolve('greeting'); // Compiles, but throws if executed: no factory was registered
```

Prefer default accumulated registration when you want registration-order checks.
Use a predeclared map when order independence is useful and verify the composition in runtime tests.

## Preserve the information the checker needs

- Keep literal tokens narrow. A token widened to `string`, or a broad index signature, loses the finite key set.
- Keep the return value of each registration chain. Do not replace its inferred type with a broader annotation.
- Keep a token's value type and lifetime consistent across registrations and `use()` replacements.
  Katagami is mutable at runtime; arbitrary mutation through aliases is not proven safe by the accumulated type.
- Use the factory's supplied resolver. Closures over another scope can bypass its lifetime restrictions.
- Fix the dependency or lifetime; `any`, assertions and suppressions can bypass TypeScript checks.
- `tryResolve` is for optional dependencies, not a workaround for required registration errors.

## Runtime checks and limits

Runtime checks report missing registrations, disposed scopes and circular resolution paths.
The captive-dependency guard detects scoped resolution in an active singleton call chain,
including indirect synchronous calls. It does not prove all lifetime relationships: in particular,
do not rely on it for work resumed after an `await` or for dependencies captured from another scope.
Use the typed factory API and runtime tests together.

## Verification

`bun run typecheck` runs the original type tests and the guarantee regressions in
`src/container/guarantees/typetest.ts`. Negative checks use `@ts-expect-error`, so a previously
rejected expression becoming accepted makes the check fail. These files are not runtime examples.
`bun run docs:check` type-checks every TypeScript fence in the maintained Markdown documentation.
