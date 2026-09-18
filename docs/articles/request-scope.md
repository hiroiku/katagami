# Catch request-scope mistakes at compile time in TypeScript

A service shared by all requests should not retain state from just one request. A DI container
can make that mistake easier to express if every factory can resolve every dependency. Katagami's
typed singleton and transient factories receive a resolver that excludes scoped registrations.

## Reproduce the problem

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — the request belongs to one scope, not a shared singleton
  .registerSingleton('handler', r => ({ requestId: r.resolve('request').id }));
```

The checker rejects the resolution of `request`. The fix depends on what the handler should do.
If it holds request state, give it a scoped lifetime:

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  .registerScoped('handler', r => ({ requestId: r.resolve('request').id }));

const first = createScope(container);
const second = createScope(container);
first.resolve('handler').requestId !== second.resolve('handler').requestId; // true
```

If the service can be stateless and shared, take request data as a method parameter instead.
Do not close over another request scope to get around the factory resolver.

## Test what types cannot establish

Type-check the wiring, then check that concurrent requests have distinct IDs, shared infrastructure
stays shared, and resources are cleaned on rejection as well as success. The
[request-scope starter](../../examples/request-scope/README.md) and its tests cover these cases.

The compile-time example uses accumulated literal keys. A broad type annotation, predeclared map,
compatible class token, assertion or captured external resolver can change what is checked.
The runtime captive-dependency guard follows the factory's resolver, including after an `await`, but not
a scope captured from elsewhere.
The [type-safety guide](../type-safety.md) explains the exact scope of the guarantee.

Katagami provides Singleton, Transient and Scoped lifetimes without decorator metadata.
The [API guide](../guide.md) shows composition, async factories and optional disposal.
