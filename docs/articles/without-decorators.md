# TypeScript dependency injection without decorators

Dependency injection can be ordinary TypeScript: a factory receives a resolver and explicitly
constructs a service. Katagami uses this model and has no runtime package dependencies, decorator
compiler flags or reflect-metadata requirement.

```sh
npm install katagami
```

## Start with a factory

```ts
import { createContainer, createScope } from 'katagami';

class Logger {
  log(message: string) { console.log(message); }
}
class Greeting {
  constructor(private logger: Logger) {}
  say(name: string) { this.logger.log(`Hello, ${name}!`); }
}

const container = createContainer()
  .registerSingleton(Logger, () => new Logger())
  .registerTransient(Greeting, r => new Greeting(r.resolve(Logger)));

createScope(container).resolve(Greeting).say('Ada');
```

The registration chain determines which class types the next factory can resolve. Class tokens
are convenient when the classes are structurally distinguishable. Literal keys or unique symbols
are also supported; see [token identity and type guarantees](../type-safety.md).

## Substitute infrastructure in a test

Factories can accept infrastructure as ordinary parameters. The
[request-scope starter](../../examples/request-scope/README.md) takes a `UserRepository` argument.
Its tests pass a small fake that returns a known name, then check the greeting. No global container
or decorator setup is required.

For larger compositions, group registrations in a container and copy them with `use()`.
Apply the fake module before resolving anything. `use()` replaces matching registration entries;
it is mutable composition, not automatic file loading or a snapshot API.

## Choose only the lifecycle features you need

Core imports come from `katagami`. Add cleanup from `katagami/disposable` or synchronous class-based
lazy resolution from `katagami/lazy` when needed. Those entry points are separate so bundlers can
omit unused implementations. Cleanup uses the host's disposal symbols; it does not provide a polyfill.

For a small application, manual constructor parameters may remain the simplest choice.
The [DI decision guide](../choosing-di.md) explains when accumulated registration types and request
scopes are useful and links to other containers' own documentation.
