[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

Lightweight TypeScript DI container with full type inference.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> The name comes from 型紙 _(katagami)_ — precision stencil paper used in traditional Japanese dyeing to transfer exact patterns onto fabric. Multiple stencils are layered to compose intricate designs, just as types accumulate through each method-chain call. A stencil needs only paper and a brush, no elaborate machinery — likewise, Katagami requires no decorators or metadata mechanisms and works with any build tool out of the box. And like stencils that work across different fabrics and techniques, Katagami adapts across TypeScript and JavaScript, class tokens and PropertyKey tokens — a hybrid approach to strict, composable DI.

## Features

| Feature                       | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Full type inference           | Types accumulate through method chaining; unregistered tokens are compile-time errors        |
| Three lifetimes               | Singleton, Transient, and Scoped with child containers                                       |
| Async factories               | Promise-returning factories are automatically tracked by the type system                     |
| Circular dependency detection | Clear error messages with the full cycle path                                                |
| Disposable support            | TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`) |
| Captive dependency prevention | Singleton/Transient factories cannot access scoped tokens; caught at compile time            |
| Optional resolution           | `tryResolve` returns `undefined` for unregistered tokens instead of throwing                 |
| Hybrid token strategy         | Class tokens for strict type safety, PropertyKey tokens for flexibility                      |
| Interface type map            | Pass an interface to `createContainer<T>()` for order-independent registration               |
| Zero dependencies             | No decorators, no reflect-metadata, no polyfills                                             |

## Install

```bash
npm install katagami
```

## Quick Start

```ts
import { createContainer } from 'katagami';

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

class UserService {
	constructor(private logger: Logger) {}
	greet(name: string) {
		this.logger.log(`Hello, ${name}`);
	}
}

const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(UserService, r => new UserService(r.resolve(Logger)));

const userService = container.resolve(UserService);
//    ^? UserService (fully inferred)
userService.greet('world');
```

## Why Katagami

Most TypeScript DI containers rely on decorators, reflect-metadata, or string-based tokens — each bringing trade-offs in tooling compatibility, type safety, or bundle size. Katagami takes a different approach.

### No decorators, no reflect-metadata

Decorator-based DI requires `experimentalDecorators` and `emitDecoratorMetadata` compiler options. Modern build tools such as esbuild and Vite (default configuration) do not support `emitDecoratorMetadata`, and the TC39 standard decorators proposal does not include an equivalent for automatic type metadata emission. Katagami depends on none of these — it works with any build tool out of the box.

### Full type inference from class tokens

String-token DI forces you to maintain manual token-to-type mappings. Parameter-name matching breaks under minification. Katagami uses classes directly as tokens, so `resolve` automatically infers the correct return type — synchronous or `Promise` — with no extra annotations.

### Method-chain type accumulation

Types accumulate with each `register` call. Inside a factory, the resolver only accepts tokens that have already been registered at that point in the chain. Resolving an unregistered token is a compile-time error, not a runtime surprise.

### Hybrid token strategy

Class tokens give you strict, order-dependent type safety through method chaining. But sometimes you want to define a set of services upfront and register them in any order. Pass an interface to `createContainer<T>()` and use PropertyKey tokens — the type map is fixed at creation time, so registration order does not matter.

### Zero dependencies

No runtime dependencies, no polyfills. No need to add reflect-metadata (~50 KB unminified) to your bundle.

## Guide

### Singleton & Transient

Singleton creates the instance on the first `resolve` and caches it. Transient creates a new instance every time.

```ts
import { createContainer } from 'katagami';

class Database {
	constructor(public id = Math.random()) {}
}

class RequestHandler {
	constructor(public id = Math.random()) {}
}

const container = createContainer()
	.registerSingleton(Database, () => new Database())
	.registerTransient(RequestHandler, () => new RequestHandler());

// Singleton — same instance every time
container.resolve(Database) === container.resolve(Database); // true

// Transient — new instance every time
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Scoped Lifetime & Child Containers

Scoped registrations behave like singletons within a scope but produce a fresh instance in each new scope. Use `createScope()` to create a child container. Scoped tokens cannot be resolved from the root container.

```ts
import { createContainer } from 'katagami';

class DbPool {
	constructor(public name = 'main') {}
}

class RequestContext {
	constructor(public id = Math.random()) {}
}

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, () => new RequestContext());

// Create a scope for each request
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — same within a scope, different across scopes
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — shared across all scopes
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

Scopes can also be nested. Each nested scope has its own scoped instance cache while sharing singletons with its parent:

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// Each nested scope gets its own scoped instances
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singletons are still shared
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### Async Factories

Factories that return a `Promise` are automatically tracked by the type system. When you `resolve` an async token, the return type is `Promise<V>` instead of `V`:

```ts
import { createContainer } from 'katagami';

class Database {
	constructor(public connected: boolean) {}
}

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async () => {
		await new Promise(r => setTimeout(r, 100)); // simulate async init
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>  (awaited → Database)
db.connected; // true
```

Async factories can depend on both sync and async registrations:

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // sync → Logger
		logger.log('Connecting...');
		return new Database(true);
	});
```

### Circular Dependency Detection

Katagami tracks which tokens are currently being resolved. If a circular dependency is found, a `ContainerError` is thrown with a clear message showing the full cycle path:

```ts
import { createContainer } from 'katagami';

class ServiceA {
	constructor(public b: ServiceB) {}
}

class ServiceB {
	constructor(public a: ServiceA) {}
}

const container = createContainer()
	.registerSingleton(ServiceA, r => new ServiceA(r.resolve(ServiceB)))
	.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

container.resolve(ServiceA);
// ContainerError: Circular dependency detected: ServiceA -> ServiceB -> ServiceA
```

Indirect cycles are also detected:

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Disposable Support

Both `Container` and `Scope` implement `AsyncDisposable`. When disposed, managed instances are iterated in reverse creation order (LIFO) and their `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` methods are called automatically.

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// Manual disposal
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

With `await using`, scopes are automatically disposed at the end of the block:

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... use conn ...
} // scope is disposed here — Connection is cleaned up, DbPool is not
```

Scope disposal only affects scoped instances. Singleton instances are owned by the root container and are disposed when the container itself is disposed.

### Interface Type Map

When you pass an interface to `createContainer<T>()`, PropertyKey tokens are typed from the interface rather than accumulated through chaining. This means you can register and resolve tokens in any order:

```ts
import { createContainer } from 'katagami';

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

interface Services {
	logger: Logger;
	greeting: string;
}

const container = createContainer<Services>()
	// 'greeting' can reference 'logger' even though it is registered later
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('Building greeting...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### Hybrid Token Strategy

You can mix both approaches — use class tokens for order-dependent type safety and PropertyKey tokens for order-independent flexibility:

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('Building greeting...');
		return 'Hello!';
	});
```

### Captive Dependency Prevention

A "captive dependency" occurs when a long-lived service (singleton or transient) captures a short-lived service (scoped), keeping it alive beyond its intended scope. Katagami prevents this at compile time — singleton and transient factories only receive a resolver limited to non-scoped tokens:

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — singleton factory cannot resolve scoped token
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

Scoped factories, on the other hand, can resolve both scoped and non-scoped tokens:

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — scoped factory can resolve singleton tokens
		return new RequestContext();
	});
```

### Optional Resolution (tryResolve)

When you need to handle optional dependencies or want to check if a token is registered without throwing an error, use `tryResolve`. Unlike `resolve`, it returns `undefined` for unregistered tokens instead of throwing `ContainerError`:

```ts
import { createContainer } from 'katagami';

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

class Analytics {
	track(event: string) {
		console.log(`Track: ${event}`);
	}
}

const container = createContainer().registerSingleton(Logger, () => new Logger());

// resolve throws for unregistered tokens
container.resolve(Analytics); // ContainerError: Token "Analytics" is not registered.

// tryResolve returns undefined for unregistered tokens
const analytics = container.tryResolve(Analytics);
//    ^? Analytics | undefined
if (analytics) {
	analytics.track('event');
}
```

`tryResolve` is especially useful for optional dependencies in factories. Unlike `resolve`, it accepts unregistered tokens without compile-time errors:

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('UserService', r => {
		const logger = r.tryResolve(Logger); // Optional dependency
		const analytics = r.tryResolve(Analytics); // No compile error even though Analytics is not registered

		return {
			greet(name: string) {
				logger?.log(`Hello, ${name}`);
				analytics?.track('user_greeted');
			},
		};
	});
```

`tryResolve` still throws `ContainerError` for circular dependencies and operations on disposed containers/scopes — only unregistered tokens return `undefined`.

## API

### `createContainer<T, ScopedT>()`

Creates a new DI container. Pass an interface as `T` to define the type map for PropertyKey tokens. Pass `ScopedT` to define a separate type map for scoped PropertyKey tokens (order-independent, just like `T`).

### `container.registerSingleton(token, factory)`

Registers a factory as a singleton. The instance is created on the first `resolve` and cached thereafter. Returns the container for method chaining.

### `container.registerTransient(token, factory)`

Registers a factory as transient. A new instance is created on every `resolve`. Returns the container for method chaining.

### `container.registerScoped(token, factory)`

Registers a factory as scoped. Within a scope, the instance is created on the first `resolve` and cached for that scope. Each scope maintains its own cache. Scoped tokens cannot be resolved from the root container. Returns the container for method chaining.

### `container.resolve(token)`

Resolves and returns the instance for the given token. Throws `ContainerError` if the token is not registered or if a circular dependency is detected.

### `container.tryResolve(token)` / `scope.tryResolve(token)`

Attempts to resolve the instance for the given token. Returns `undefined` if the token is not registered, instead of throwing. Still throws `ContainerError` for circular dependencies or operations on disposed containers/scopes.

### `container.createScope()`

Creates a new `Scope` (child container). The scope inherits all registrations from the parent. Singleton instances are shared with the parent, while scoped instances are local to the scope.

### `Scope`

A scoped child container created by `createScope()`. Provides `resolve(token)`, `tryResolve(token)`, `createScope()` (for nested scopes), and `[Symbol.asyncDispose]()`.

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

Disposes all managed instances in reverse creation order (LIFO). Calls `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` on each instance that implements them. Idempotent — subsequent calls are no-ops. After disposal, `resolve()` and `createScope()` will throw `ContainerError`.

### `ContainerError`

Error class thrown for container failures such as resolving an unregistered token, circular dependencies, or operations on a disposed container/scope.

### `Resolver`

Type export representing the resolver passed to factory callbacks. Useful when you need to type a function that accepts a resolver parameter.

## License

MIT
