# Type-safe dependency injection for AI coding agents

AI-assisted development still needs a way to check the code it produces. For dependency wiring,
a useful loop is small: edit the composition root, run TypeScript, read the diagnostics, and repair
the missing dependency or incorrect lifetime. Katagami makes some of those wiring constraints visible
to the compiler by accumulating types as dependencies are registered.

## Let registration define the available dependencies

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('users', () => ({ find: (id: string) => `user-${id}` }))
  .registerScoped('handler', r => (id: string) => r.resolve('users').find(id));

createScope(container).resolve('handler')('42');
```

There is no manually maintained service interface in this example. The first registration adds
`users` to the type known by the next factory. The second adds `handler` to the scope's visible set.
Changing `r.resolve('users')` to `r.resolve('user')` produces a type error. Removing the first
registration also produces a type error at the consumer.

The check is useful for both people and coding agents: the factory's actual dependency is written
in the same code that TypeScript checks. The compiler can report a problem without starting the app.

## Turn a diagnostic into a repair

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('requestId', () => crypto.randomUUID())
  // @ts-expect-error — a singleton factory cannot access this scoped dependency
  .registerSingleton('handler', r => r.resolve('requestId'));
```

The diagnostic includes `No overload matches this call`. Inspect the failing resolution and its
lifetime: the factory requests state belonging to one request while asking to be shared as a singleton.
Register the handler as scoped, or pass the request ID into a shared service's method without storing it.

`@ts-expect-error` is only present to test this intentionally invalid example. It is not the repair.
In application code, change the wiring, run `npx tsc --noEmit`, then run behavior tests.

## Make the workflow usable

Give the agent the [v3 usage guide](../ai-coding-agents.md), the application's composition root and
its verification command. Have it use the supplied factory resolver, preserve inferred registration
types and run the checker after changes. A [runnable request-scope starter](../../examples/request-scope/README.md)
shows fake injection, concurrent calls and cleanup on both success and failure.

Ordinary constructor or function injection is still a useful baseline. It also gets TypeScript's
parameter checks and can be enough for small applications. Introduce a container when construction,
sharing, request scope or module composition is otherwise becoming repetitive.

## State the guarantee accurately

Accumulated literal keys and unique symbols let the checker reject tokens outside the visible
registered set. A predeclared `createContainer<Services>()` map instead permits forward references
and does not establish runtime registration completeness. Class tokens follow TypeScript's
structural typing, so another compatible class may pass the checker while being a different runtime key.
See [working examples of these boundaries](../type-safety.md).

The compiler cases in this article are tested. We have not measured agent repair success or token
savings. Those need [controlled repeated trials](https://github.com/hiroiku/katagami/tree/master/benchmarks/agent-wiring),
including failures and the same tasks, model settings and runtime tests across variants.

Install with `npm install katagami`, then start with the
[quick start](../../README.md#quick-start) or the [request-scope example](../../examples/request-scope/README.md).
