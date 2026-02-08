[English](./README.md) | [日本語](./README.ja.md)

# Katagami

Lightweight TypeScript DI container with full type inference.

> The name comes from 型紙 _(katagami)_ — precision stencil paper used in traditional Japanese dyeing to transfer exact patterns onto fabric. Multiple stencils are layered to compose intricate designs, just as types accumulate through each method-chain call. A stencil needs only paper and a brush, no elaborate machinery — likewise, Katagami requires no decorators or metadata mechanisms and works with any build tool out of the box. And like stencils that work across different fabrics and techniques, Katagami adapts across TypeScript and JavaScript, class tokens and PropertyKey tokens — a hybrid approach to strict, composable DI.

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

## Install

```bash
npm install katagami
```

## Usage (TypeScript)

Use class tokens for full type inference:

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

## Usage (JavaScript)

Use string or Symbol tokens:

```js
import { createContainer } from 'katagami';

const container = createContainer()
	.registerSingleton('logger', () => ({
		log: msg => console.log(msg),
	}))
	.registerSingleton('userService', r => ({
		greet: name => r.resolve('logger').log(`Hello, ${name}`),
	}));

const userService = container.resolve('userService');
userService.greet('world');
```

## Async Factories

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

## Interface Type Map

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

## API

### `createContainer<T>()`

Creates a new DI container. Pass an interface as `T` to define the type map for PropertyKey tokens.

### `container.registerSingleton(token, factory)`

Registers a factory as a singleton. The instance is created on the first `resolve` and cached thereafter. Returns the container for method chaining.

### `container.registerTransient(token, factory)`

Registers a factory as transient. A new instance is created on every `resolve`. Returns the container for method chaining.

### `container.resolve(token)`

Resolves and returns the instance for the given token. Throws `ContainerError` if the token is not registered.

### `ContainerError`

Error class thrown when resolving an unregistered token.

## License

MIT
