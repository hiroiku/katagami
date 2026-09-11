# Choosing a TypeScript dependency injection approach

Choose based on the application's wiring and lifecycle needs. There is no measured claim here
that Katagami is faster, safer in every scenario, or more effective for every coding agent.

| Approach | Consider it when | What to account for |
| --- | --- | --- |
| Ordinary constructor/function parameters | A small number of dependencies is easy to wire by hand | Your code owns construction, sharing and cleanup; TypeScript still checks parameter types |
| Katagami | You want explicit factories, accumulated registration types and request scopes | Preserve narrow token types; understand structural class identity and predeclared-map limits |
| Your framework's existing DI | The application already uses a framework container | Its conventions and lifecycle integrations may avoid maintaining a second container |
| Awilix | Its registration, injection and loading conventions fit your app | Read its own TypeScript and strict-mode documentation for guarantees and configuration |
| InversifyJS | Its class-oriented binding model and ecosystem fit your app | Follow its current setup instructions, including metadata requirements where applicable |

Katagami's concrete distinction is that the default registration chain accumulates a resolver's
visible token set. For literal keys or unique symbols, a missing token is rejected before execution.
That is a useful check for both human-written and AI-generated wiring. It does not establish that
other libraries lack type safety, and it does not eliminate runtime tests.

Start with the [runnable starter](../examples/request-scope/README.md),
[guarantee examples](./type-safety.md) and [composition guide](./guide.md#composition-and-test-substitution).

Primary references, reviewed 2026-09-11:

- [Awilix's maintained README](https://github.com/jeffijoe/awilix#readme), including TypeScript and strict mode.
- [InversifyJS getting started](https://inversify.io/docs/introduction/getting-started/).
- [TypeScript type compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility).

The previous broad feature matrix was replaced with this decision guide. Replacing registrations
with `use()` is explicit composition; Katagami does not implement automatic module discovery,
immutable containers or a dedicated snapshot/restore API.
