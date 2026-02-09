[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

轻量级 TypeScript DI 容器，支持完整的类型推断。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> 名称源自日语「型紙」_(katagami)_——一种用于传统日本染色工艺的精密型版纸，将精确的图案转印到织物上。多张型版叠加组合出复杂的纹样，正如类型随着每次方法链调用而逐步积累。每张型版都是独立的——只取当前工作所需的那张，其余留在架上——正如子路径导出确保只有你使用的代码进入包中。型版的镂空精确地决定了染料通过和阻挡的位置，正如 Katagami 的类型系统在编译时而非运行时捕获误用。而型版只需纸和刷子，无需精密的机械装置——同样地，Katagami 不依赖装饰器或元数据机制，开箱即用于任何构建工具。

## 特性

| 特性            | 说明                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------- |
| 零依赖          | 无需装饰器、无需 reflect-metadata、无需 polyfill — 适用于任何构建工具，开箱即用               |
| 完整的类型推断  | 类型随方法链积累；解析未注册的令牌会产生编译时错误                                            |
| Tree Shaking    | 子路径导出（`katagami/scope`、`katagami/disposable`）配合 `sideEffects: false` 实现最小包体积 |
| 捕获依赖防护    | Singleton/Transient 工厂无法访问 Scoped 令牌；在编译时及作用域内的运行时捕获                  |
| 混合令牌策略    | 类令牌提供严格的类型安全，PropertyKey 令牌提供灵活性                                          |
| 接口类型映射    | 向 `createContainer<T>()` 传入接口，实现与注册顺序无关的注册                                  |
| 三种生命周期    | Singleton、Transient 和 Scoped（支持子容器）                                                  |
| Disposable 支持 | TC39 显式资源管理（`Symbol.dispose` / `Symbol.asyncDispose` / `await using`）                 |
| 模块组合        | 通过 `use()` 组合容器，将注册分组并重复使用                                                   |
| 异步工厂        | 返回 Promise 的工厂会被类型系统自动追踪                                                       |
| 循环依赖检测    | 包含完整循环路径的清晰错误消息                                                                |
| 可选解析        | `tryResolve` 对未注册令牌返回 `undefined` 而非抛出异常                                        |
| 延迟解析        | 通过 `katagami/lazy` 的 `lazy()` 实现基于 Proxy 的延迟实例化；首次访问时创建                  |

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

> **注意：** 本比较表基于 2026-02-09 的调查。各库功能可能已有变更。

| Aspect                            | Katagami                                                         | InversifyJS                      | tsyringe                                        | TypeDI                                  | Awilix                              | NestJS                                | Effect                            | typed-inject                   |
| --------------------------------- | ---------------------------------------------------------------- | -------------------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------------- | --------------------------------- | ------------------------------ |
| **Runtime requirements**          | ✅ None                                                          | ❌ reflect-metadata, decorators  | ❌ reflect-metadata, decorators                 | ❌ reflect-metadata, decorators         | ✅ None                             | ❌ reflect-metadata, decorators       | ✅ None                           | ✅ None                        |
| **Lifetimes**                     | ✅ Singleton, Transient, Scoped                                  | ✅ Singleton, Transient, Request | ✅ Singleton, Transient, Resolution / Container | Singleton, Transient (named containers) | ✅ Singleton, Transient, Scoped     | ✅ Singleton, Transient, Request      | Shared (memoized), Scoped         | ❌ Singleton, Transient        |
| **Injection style**               | Constructor (explicit factory)                                   | Constructor, Property            | Constructor                                     | Constructor, Property                   | Constructor (proxy / classic)       | Constructor                           | Functional (Tag + Layer)          | Constructor (static inject)    |
| **Token types**                   | Class, PropertyKey, Interface map                                | Class, String, Symbol            | Class, String, Symbol                           | Class, String, Token\<T\>               | String                              | Class, String, Symbol, InjectionToken | Context.Tag                       | String literal                 |
| **Type safety**                   | ✅ Compile-time; full inference, captive-dep guard (+ runtime)   | ❌ Generic binding types         | ❌ Generic types                                | ❌ Generic types, Token\<T\>            | ❌ Cradle interface typing          | ❌ Generic types                      | ✅ Compile-time; R type parameter | ✅ Compile-time; static inject |
| **Resource cleanup**              | ✅ TC39 Symbol.dispose / asyncDispose; await using               | Deactivation handlers            | container.dispose()                             | Container.reset()                       | Disposer functions                  | Lifecycle hooks (onModuleDestroy)     | Scope finalizers; acquireRelease  | injector.dispose()             |
| **Tree-shaking**                  | ✅ Subpath exports; sideEffects: false                           | ❌                               | ❌                                              | ❌                                      | ✅ No decorator / metadata overhead | ❌                                    | ✅ Subpath exports; ESM           | ✅ Zero deps; small bundle     |
| **Async factories**               | ✅                                                               | ✅                               | ❌                                              | ❌                                      | ❌                                  | ✅                                    | ✅                                | ❌                             |
| **Optional resolution**           | ✅                                                               | ✅                               | ✅                                              | ✅                                      | ✅                                  | ✅                                    | ✅                                | ❌                             |
| **Multi-binding**                 | ✅                                                               | ✅                               | ✅                                              | ✅                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |
| **Lazy resolution**               | ✅                                                               | ✅                               | ✅                                              | ❌                                      | ✅                                  | ✅ LazyModuleLoader                   | ✅ Lazy by design                 | ❌                             |
| **Conditional bindings**          | ✅ Token separation + factory logic + scopes                     | ✅ Named, tagged, contextual     | ❌                                              | ❌                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |
| **Auto-loading**                  | ✅ use() module composition (explicit, decorator-free by design) | ✅                               | ❌                                              | ❌                                      | ✅                                  | ❌                                    | ❌                                | ❌                             |
| **Child containers**              | ✅                                                               | ✅                               | ✅                                              | ✅                                      | ✅                                  | ✅                                    | ✅                                | ✅                             |
| **Module system**                 | ✅                                                               | ✅                               | ❌                                              | ❌                                      | ✅                                  | ✅                                    | ✅                                | ❌                             |
| **Circular dependency detection** | ✅                                                               | ✅                               | ✅                                              | ❌                                      | ✅                                  | ✅                                    | ✅                                | ❌                             |
| **Middleware / Interceptors**     | ✅ Higher-order factory wrappers                                 | ✅                               | ✅                                              | ❌                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |
| **Snapshot / Restore**            | ✅ Immutable containers; use() for test isolation                | ✅                               | ❌                                              | ❌                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |

### 无需装饰器，无需 reflect-metadata

基于装饰器的 DI 需要 `experimentalDecorators` 和 `emitDecoratorMetadata` 编译器选项。esbuild 和 Vite（默认配置）等现代构建工具不支持 `emitDecoratorMetadata`，且 TC39 标准装饰器提案也不包含自动类型元数据发射的等效功能。Katagami 不依赖这些——它可以开箱即用于任何构建工具。

### Tree Shaking

Katagami 通过子路径导出拆分功能。只需导入你使用的部分——如果不导入 `katagami/scope`、`katagami/disposable` 和 `katagami/lazy`，它们将从包中完全移除。配合 `sideEffects: false`，构建工具可以移除每一个未使用的字节。

```ts
// 仅核心 — scope、disposable 和 lazy 不会包含在包中
import { createContainer } from 'katagami';

// 按需导入
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

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

Scoped 注册在作用域内表现得像 Singleton，但在每个新作用域中会产生新的实例。从 `katagami/scope` 导入 `createScope` 来创建子容器。Scoped 令牌无法从根容器解析。

```ts
import { createContainer } from 'katagami';
import { createScope } from 'katagami/scope';

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
const scope1 = createScope(root);
const scope2 = createScope(root);

// Scoped — 同一作用域内相同，不同作用域间不同
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — 在所有作用域间共享
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

作用域也可以嵌套。每个嵌套的作用域拥有自己的 Scoped 实例缓存，同时与父级共享 Singleton：

```ts
const parentScope = createScope(root);
const childScope = createScope(parentScope);

// 每个嵌套作用域获得独立的 Scoped 实例
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singleton 仍然共享
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### 模块组合

将相关的注册以 `createContainer()` 分组为模块，并通过 `use()` 应用到其他容器。仅复制注册条目（工厂和生命周期），不共享单例实例缓存。

```ts
import { createContainer } from 'katagami';

class AuthService {
	authenticate() {
		return true;
	}
}

class TokenService {
	issue() {
		return 'token';
	}
}

class UserService {
	constructor(private auth: AuthService, private tokens: TokenService) {}
}

// 定义可重复使用的模块
const authModule = createContainer()
	.registerSingleton(AuthService, () => new AuthService())
	.registerSingleton(TokenService, () => new TokenService());

// 组合模块
const container = createContainer()
	.use(authModule)
	.registerSingleton(UserService, r => new UserService(r.resolve(AuthService), r.resolve(TokenService)));
```

模块也可以组合其他模块：

```ts
const infraModule = createContainer().registerSingleton(AuthService, () => new AuthService());

const appModule = createContainer()
	.use(infraModule)
	.registerSingleton(UserService, r => new UserService(r.resolve(AuthService), r.resolve(TokenService)));

// appModule 同时包含 AuthService 和 UserService
const container = createContainer().use(appModule);
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

销毁功能由 `katagami/disposable` 的 `disposable()` 包装器提供。包装容器或作用域会附加 `[Symbol.asyncDispose]`，启用 `await using` 语法。销毁时，托管实例按创建的逆序（LIFO）遍历，并自动调用其 `[Symbol.asyncDispose]()` 或 `[Symbol.dispose]()` 方法。

```ts
import { createContainer } from 'katagami';
import { disposable } from 'katagami/disposable';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// 手动销毁
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

使用 `await using` 时，作用域在块结束时自动销毁：

```ts
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = disposable(createScope(root));
	const conn = scope.resolve(Connection);
	// ... 使用 conn ...
} // 此处作用域被销毁 — Connection 被清理，DbPool 不受影响
```

作用域销毁仅影响 Scoped 实例。Singleton 实例归根容器所有，在容器本身销毁时才会被销毁。

`disposable()` 包装器也会缩窄返回类型，在类型层面移除注册方法（`registerSingleton`、`registerTransient`、`registerScoped`、`use`）。这可以防止对可能已销毁的容器进行意外注册：

```ts
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection); // OK
container.registerSingleton(/* ... */); // 编译时错误
```

### Tree Shaking

Katagami 使用子路径导出将功能拆分为独立的入口点。如果你只需要核心容器，`katagami/scope`、`katagami/disposable` 和 `katagami/lazy` 将从包中完全排除。包声明了 `sideEffects: false`，因此构建工具可以安全地移除任何未使用的代码。

```ts
// 仅核心 — scope、disposable 和 lazy 不会包含在包中
import { createContainer } from 'katagami';

// 按需导入
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

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

Katagami 也在作用域内的运行时强制执行此规则。如果 Singleton 工厂尝试直接或间接解析 Scoped 令牌，将抛出 `ContainerError`：

```ts
import { createContainer } from 'katagami';
import { createScope } from 'katagami/scope';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));

const scope = createScope(container);
scope.resolve(DbPool);
// ContainerError: Captive dependency detected: scoped token "RequestContext" cannot be resolved inside a singleton factory.
```

### 可选解析（tryResolve）

当需要处理可选依赖或想在不抛出错误的情况下检查令牌是否已注册时，使用 `tryResolve`。与 `resolve` 不同，它对未注册的令牌返回 `undefined` 而不是抛出 `ContainerError`：

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

// resolve 对未注册令牌抛出异常
container.resolve(Analytics); // ContainerError: Token "Analytics" is not registered.

// tryResolve 对未注册令牌返回 undefined
const analytics = container.tryResolve(Analytics);
//    ^? Analytics | undefined
if (analytics) {
	analytics.track('event');
}
```

`tryResolve` 对于工厂中的可选依赖特别有用。与 `resolve` 不同，它接受未注册的令牌而不会产生编译时错误：

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('UserService', r => {
		const logger = r.tryResolve(Logger); // 可选依赖
		const analytics = r.tryResolve(Analytics); // Analytics 未注册但不会产生编译错误

		return {
			greet(name: string) {
				logger?.log(`Hello, ${name}`);
				analytics?.track('user_greeted');
			},
		};
	});
```

`tryResolve` 仍会对循环依赖和已销毁容器/作用域的操作抛出 `ContainerError` — 只有未注册的令牌才返回 `undefined`。

### 延迟解析（Lazy Resolution）

`katagami/lazy` 的 `lazy()` 函数创建一个代理，将实例创建延迟到首次属性访问时。这对于优化启动时间或打破循环依赖很有用。

```ts
import { createContainer } from 'katagami';
import { lazy } from 'katagami/lazy';

class HeavyService {
	constructor() {
		// 昂贵的初始化
	}
	process() {
		return 'done';
	}
}

const container = createContainer().registerSingleton(HeavyService, () => new HeavyService());

const service = lazy(container, HeavyService);
// HeavyService 尚未被实例化

service.process(); // 此处创建实例并缓存
service.process(); // 使用缓存的实例
```

代理会透明地将所有属性访问、方法调用、`in` 检查和原型查找转发到真实实例。方法会自动绑定到真实实例，因此即使解构后 `this` 也能正确工作。

仅支持**同步类令牌**。由于 Proxy 陷阱是同步的，异步令牌和 PropertyKey 令牌在类型层面会被拒绝。

`lazy()` 适用于 Container、Scope、DisposableContainer 和 DisposableScope：

```ts
import { createScope } from 'katagami/scope';

const root = createContainer().registerScoped(RequestContext, () => new RequestContext());
const scope = createScope(root);

const ctx = lazy(scope, RequestContext); // 延迟的 Scoped 解析
```

## API

### `createContainer<T, ScopedT>()`

创建新的 DI 容器。传入接口作为 `T` 以定义 PropertyKey 令牌的类型映射。传入 `ScopedT` 以定义 Scoped PropertyKey 令牌的独立类型映射（与 `T` 一样与注册顺序无关）。

### `Container.prototype.registerSingleton(token, factory)`

将工厂注册为 Singleton。实例在首次 `resolve` 时创建并缓存。返回容器以支持方法链。

### `Container.prototype.registerTransient(token, factory)`

将工厂注册为 Transient。每次 `resolve` 都会创建新实例。返回容器以支持方法链。

### `Container.prototype.registerScoped(token, factory)`

将工厂注册为 Scoped。在作用域内，实例在首次 `resolve` 时创建并在该作用域内缓存。每个作用域维护自己的缓存。Scoped 令牌无法从根容器解析。返回容器以支持方法链。

### `Container.prototype.use(source)`

将 `source`（另一个 `Container`）的所有注册复制到此容器中。仅复制工厂和生命周期条目，不共享单例实例缓存。返回容器以支持方法链。

### `Container.prototype.resolve(token)`

解析并返回给定令牌的实例。如果令牌未注册或检测到循环依赖，则抛出 `ContainerError`。

### `Container.prototype.tryResolve(token)`

尝试解析给定令牌的实例。如果令牌未注册，返回 `undefined` 而不是抛出异常。对于循环依赖或已销毁容器/作用域的操作仍会抛出 `ContainerError`。

### `createScope(source)` — `katagami/scope`

从 `Container` 或现有的 `Scope` 创建新的 `Scope`（子容器）。

### `class Scope`

由 `createScope()` 创建的作用域子容器。

### `Scope.prototype.resolve(token)`

解析并返回给定令牌的实例。与 `Container.prototype.resolve` 行为相同，但还可以解析 Scoped 令牌。

### `Scope.prototype.tryResolve(token)`

尝试解析给定令牌的实例。如果令牌未注册，返回 `undefined` 而不是抛出异常。对于循环依赖或已销毁作用域的操作仍会抛出 `ContainerError`。

### `lazy(source, token)` — `katagami/lazy`

创建一个 Proxy，将 `resolve()` 延迟到首次属性访问。已解析的实例会被缓存——后续访问使用缓存。仅支持同步类令牌；异步令牌和 PropertyKey 令牌在类型层面被拒绝。适用于 `Container`、`Scope`、`DisposableContainer` 和 `DisposableScope`。

### `disposable(container)` — `katagami/disposable`

为 `Container` 或 `Scope` 附加 `[Symbol.asyncDispose]`，启用 `await using` 语法。按创建的逆序（LIFO）销毁所有托管实例。调用每个实例的 `[Symbol.asyncDispose]()` 或 `[Symbol.dispose]()`。幂等——后续调用为空操作。销毁后，`resolve()` 将抛出 `ContainerError`。返回类型被缩窄为 `DisposableContainer` 或 `DisposableScope`，仅公开 `resolve` 和 `tryResolve` — 注册方法在类型层面被移除。

### `class ContainerError`

用于容器故障的错误类，例如解析未注册的令牌、循环依赖或对已销毁容器/作用域的操作。

### `type Resolver`

表示传递给工厂回调的解析器的类型导出。当你需要为接受解析器参数的函数添加类型时很有用。

## 许可证

MIT
