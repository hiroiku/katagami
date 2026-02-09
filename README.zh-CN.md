[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

轻量级 TypeScript DI 容器，支持完整的类型推断。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> 名称源自日语「型紙」_(katagami)_——一种用于传统日本染色工艺的精密型版纸，将精确的图案转印到织物上。多张型版叠加组合出复杂的纹样，正如类型随着每次方法链调用而逐步积累。型版只需纸和刷子，无需精密的机械装置——同样地，Katagami 不依赖装饰器或元数据机制，开箱即用于任何构建工具。而就像型版能适应不同的织物与技法，Katagami 也能跨越 TypeScript 与 JavaScript、类令牌与 PropertyKey 令牌——以混合方式实现严格、可组合的 DI。

## 特性

| 特性            | 说明                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| 完整的类型推断  | 类型随方法链积累；解析未注册的令牌会产生编译时错误                            |
| 三种生命周期    | Singleton、Transient 和 Scoped（支持子容器）                                  |
| 异步工厂        | 返回 Promise 的工厂会被类型系统自动追踪                                       |
| 循环依赖检测    | 包含完整循环路径的清晰错误消息                                                |
| Disposable 支持 | TC39 显式资源管理（`Symbol.dispose` / `Symbol.asyncDispose` / `await using`） |
| 捕获依赖防护    | Singleton/Transient 工厂无法访问 Scoped 令牌；在编译时捕获                    |
| 混合令牌策略    | 类令牌提供严格的类型安全，PropertyKey 令牌提供灵活性                          |
| 接口类型映射    | 向 `createContainer<T>()` 传入接口，实现与注册顺序无关的注册                  |
| 零依赖          | 无需装饰器、无需 reflect-metadata、无需 polyfill                              |

## 安装

```bash
npm install katagami
```

## 快速开始

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
//    ^? UserService（完全推断）
userService.greet('world');
```

## 为什么选择 Katagami

大多数 TypeScript DI 容器依赖于装饰器、reflect-metadata 或基于字符串的令牌——每种方式都在工具兼容性、类型安全或包体积方面带来取舍。Katagami 采用了不同的方式。

### 无需装饰器，无需 reflect-metadata

基于装饰器的 DI 需要 `experimentalDecorators` 和 `emitDecoratorMetadata` 编译器选项。esbuild 和 Vite（默认配置）等现代构建工具不支持 `emitDecoratorMetadata`，且 TC39 标准装饰器提案也不包含自动类型元数据发射的等效功能。Katagami 不依赖这些——它可以开箱即用于任何构建工具。

### 基于类令牌的完整类型推断

基于字符串令牌的 DI 迫使你维护手动的令牌到类型映射。基于参数名的匹配在代码压缩后会失效。Katagami 直接使用类作为令牌，因此 `resolve` 会自动推断正确的返回类型——同步或 `Promise`——无需额外注解。

### 方法链类型积累

每次 `register` 调用都会积累类型。在工厂内部，解析器只接受链中该位置之前已注册的令牌。解析未注册的令牌会产生编译时错误，而非运行时意外。

### 混合令牌策略

类令牌通过方法链提供严格的、顺序依赖的类型安全。但有时你希望预先定义一组服务并以任意顺序注册。向 `createContainer<T>()` 传入接口并使用 PropertyKey 令牌——类型映射在创建时即已固定，注册顺序不再重要。

### 零依赖

无运行时依赖，无 polyfill。无需将 reflect-metadata（未压缩约 50 KB）添加到包中。

## 指南

### Singleton 与 Transient

Singleton 在首次 `resolve` 时创建实例并缓存。Transient 每次都创建新实例。

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

// Singleton — 每次都是同一个实例
container.resolve(Database) === container.resolve(Database); // true

// Transient — 每次都是新实例
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Scoped 生命周期与子容器

Scoped 注册在作用域内表现得像 Singleton，但在每个新作用域中会产生新的实例。使用 `createScope()` 创建子容器。Scoped 令牌无法从根容器解析。

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

// 为每个请求创建作用域
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — 同一作用域内相同，不同作用域间不同
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — 在所有作用域间共享
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

作用域也可以嵌套。每个嵌套的作用域拥有自己的 Scoped 实例缓存，同时与父级共享 Singleton：

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// 每个嵌套作用域获得独立的 Scoped 实例
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singleton 仍然共享
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### 异步工厂

返回 `Promise` 的工厂会被类型系统自动追踪。当你 `resolve` 异步令牌时，返回类型是 `Promise<V>` 而非 `V`：

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
		await new Promise(r => setTimeout(r, 100)); // 模拟异步初始化
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>（await 后 → Database）
db.connected; // true
```

异步工厂可以依赖同步和异步的注册：

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // 同步 → Logger
		logger.log('正在连接...');
		return new Database(true);
	});
```

### 循环依赖检测

Katagami 会追踪当前正在解析的令牌。如果发现循环依赖，将抛出包含完整循环路径的 `ContainerError`：

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

间接循环也能被检测到：

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Disposable 支持

`Container` 和 `Scope` 都实现了 `AsyncDisposable`。销毁时，托管实例按创建的逆序（LIFO）遍历，并自动调用其 `[Symbol.asyncDispose]()` 或 `[Symbol.dispose]()` 方法。

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// 手动销毁
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

使用 `await using` 时，作用域在块结束时自动销毁：

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... 使用 conn ...
} // 此处作用域被销毁 — Connection 被清理，DbPool 不受影响
```

作用域销毁仅影响 Scoped 实例。Singleton 实例归根容器所有，在容器本身销毁时才会被销毁。

### 接口类型映射

当你向 `createContainer<T>()` 传入接口时，PropertyKey 令牌的类型来源于接口而非通过链式积累。这意味着你可以以任意顺序注册和解析令牌：

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
	// 'greeting' 可以引用 'logger'，即使 'logger' 是后注册的
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('正在构建 greeting...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### 混合令牌策略

你可以混合使用两种方式——使用类令牌获得顺序依赖的类型安全，使用 PropertyKey 令牌获得顺序无关的灵活性：

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('正在构建 greeting...');
		return 'Hello!';
	});
```

### 捕获依赖防护

"捕获依赖"是指长生命周期的服务（Singleton 或 Transient）捕获了短生命周期的服务（Scoped），使其存活超出预期的作用域。Katagami 在编译时防止这种情况——Singleton 和 Transient 工厂只会收到限制为非 Scoped 令牌的解析器：

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — Singleton 工厂无法解析 Scoped 令牌
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

而 Scoped 工厂则可以解析 Scoped 和非 Scoped 令牌：

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — Scoped 工厂可以解析 Singleton 令牌
		return new RequestContext();
	});
```

## API

### `createContainer<T, ScopedT>()`

创建新的 DI 容器。传入接口作为 `T` 以定义 PropertyKey 令牌的类型映射。传入 `ScopedT` 以定义 Scoped PropertyKey 令牌的独立类型映射（与 `T` 一样与注册顺序无关）。

### `container.registerSingleton(token, factory)`

将工厂注册为 Singleton。实例在首次 `resolve` 时创建并缓存。返回容器以支持方法链。

### `container.registerTransient(token, factory)`

将工厂注册为 Transient。每次 `resolve` 都会创建新实例。返回容器以支持方法链。

### `container.registerScoped(token, factory)`

将工厂注册为 Scoped。在作用域内，实例在首次 `resolve` 时创建并在该作用域内缓存。每个作用域维护自己的缓存。Scoped 令牌无法从根容器解析。返回容器以支持方法链。

### `container.resolve(token)`

解析并返回给定令牌的实例。如果令牌未注册或检测到循环依赖，则抛出 `ContainerError`。

### `container.createScope()`

创建新的 `Scope`（子容器）。作用域继承父级的所有注册。Singleton 实例与父级共享，Scoped 实例为作用域本地。

### `Scope`

由 `createScope()` 创建的作用域子容器。提供 `resolve(token)`、`createScope()`（用于嵌套作用域）和 `[Symbol.asyncDispose]()`。

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

按创建的逆序（LIFO）销毁所有托管实例。调用每个实例的 `[Symbol.asyncDispose]()` 或 `[Symbol.dispose]()`。幂等——后续调用为空操作。销毁后，`resolve()` 和 `createScope()` 将抛出 `ContainerError`。

### `ContainerError`

用于容器故障的错误类，例如解析未注册的令牌、循环依赖或对已销毁容器/作用域的操作。

### `Resolver`

表示传递给工厂回调的解析器的类型导出。当你需要为接受解析器参数的函数添加类型时很有用。

## 许可证

MIT
