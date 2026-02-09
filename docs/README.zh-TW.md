[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

輕量級 TypeScript DI 容器，支援完整的型別推斷。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> 名稱源自日語「型紙」_(katagami)_——一種用於傳統日本染色工藝的精密型版紙，將精確的圖案轉印到織物上。多張型版疊加組合出繁複的紋樣，正如型別隨著每次方法鏈呼叫而逐步累積。型版只需紙和刷子，無需精密的機械裝置——同樣地，Katagami 不依賴裝飾器或元資料機制，開箱即用於任何建置工具。而就像型版能適應不同的織物與技法，Katagami 也能跨越 TypeScript 與 JavaScript、類別令牌與 PropertyKey 令牌——以混合方式實現嚴格、可組合的 DI。

## 特性

| 特性            | 說明                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| 完整的型別推斷  | 型別隨方法鏈累積；解析未註冊的令牌會產生編譯時錯誤                            |
| 三種生命週期    | Singleton、Transient 和 Scoped（支援子容器）                                  |
| 非同步工廠      | 回傳 Promise 的工廠會被型別系統自動追蹤                                       |
| 循環依賴偵測    | 包含完整循環路徑的清晰錯誤訊息                                                |
| Disposable 支援 | TC39 顯式資源管理（`Symbol.dispose` / `Symbol.asyncDispose` / `await using`） |
| 捕獲依賴防護    | Singleton/Transient 工廠無法存取 Scoped 令牌；在編譯時捕獲                    |
| 選擇性解析      | `tryResolve` 對未註冊令牌回傳 `undefined` 而非拋出例外                        |
| 混合令牌策略    | 類別令牌提供嚴格的型別安全，PropertyKey 令牌提供彈性                          |
| 介面型別映射    | 向 `createContainer<T>()` 傳入介面，實現與註冊順序無關的註冊                  |
| 零依賴          | 無需裝飾器、無需 reflect-metadata、無需 polyfill                              |

## 安裝

```bash
npm install katagami
```

## 快速開始

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
//    ^? UserService（完全推斷）
userService.greet('world');
```

## 為什麼選擇 Katagami

大多數 TypeScript DI 容器依賴於裝飾器、reflect-metadata 或基於字串的令牌——每種方式都在工具相容性、型別安全或套件大小方面帶來取捨。Katagami 採用了不同的方式。

### 無需裝飾器，無需 reflect-metadata

基於裝飾器的 DI 需要 `experimentalDecorators` 和 `emitDecoratorMetadata` 編譯器選項。esbuild 和 Vite（預設配置）等現代建置工具不支援 `emitDecoratorMetadata`，且 TC39 標準裝飾器提案也不包含自動型別元資料發射的等效功能。Katagami 不依賴這些——它可以開箱即用於任何建置工具。

### 基於類別令牌的完整型別推斷

基於字串令牌的 DI 迫使你維護手動的令牌到型別對應。基於參數名的匹配在程式碼壓縮後會失效。Katagami 直接使用類別作為令牌，因此 `resolve` 會自動推斷正確的回傳型別——同步或 `Promise`——無需額外註解。

### 方法鏈型別累積

每次 `register` 呼叫都會累積型別。在工廠內部，解析器只接受鏈中該位置之前已註冊的令牌。解析未註冊的令牌會產生編譯時錯誤，而非執行時意外。

### 混合令牌策略

類別令牌透過方法鏈提供嚴格的、順序依賴的型別安全。但有時你希望預先定義一組服務並以任意順序註冊。向 `createContainer<T>()` 傳入介面並使用 PropertyKey 令牌——型別映射在建立時即已固定，註冊順序不再重要。

### 零依賴

無執行時依賴，無 polyfill。無需將 reflect-metadata（未壓縮約 50 KB）加入套件中。

## 指南

### Singleton 與 Transient

Singleton 在首次 `resolve` 時建立實例並快取。Transient 每次都建立新實例。

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

// Singleton — 每次都是同一個實例
container.resolve(Database) === container.resolve(Database); // true

// Transient — 每次都是新實例
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Scoped 生命週期與子容器

Scoped 註冊在作用域內表現得像 Singleton，但在每個新作用域中會產生新的實例。使用 `createScope()` 建立子容器。Scoped 令牌無法從根容器解析。

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

// 為每個請求建立作用域
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — 同一作用域內相同，不同作用域間不同
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — 在所有作用域間共享
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

作用域也可以巢狀。每個巢狀的作用域擁有自己的 Scoped 實例快取，同時與父級共享 Singleton：

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// 每個巢狀作用域獲得獨立的 Scoped 實例
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singleton 仍然共享
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### 非同步工廠

回傳 `Promise` 的工廠會被型別系統自動追蹤。當你 `resolve` 非同步令牌時，回傳型別是 `Promise<V>` 而非 `V`：

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
		await new Promise(r => setTimeout(r, 100)); // 模擬非同步初始化
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>（await 後 → Database）
db.connected; // true
```

非同步工廠可以依賴同步和非同步的註冊：

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // 同步 → Logger
		logger.log('正在連線...');
		return new Database(true);
	});
```

### 循環依賴偵測

Katagami 會追蹤當前正在解析的令牌。如果發現循環依賴，將拋出包含完整循環路徑的 `ContainerError`：

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

間接循環也能被偵測到：

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Disposable 支援

`Container` 和 `Scope` 都實作了 `AsyncDisposable`。銷毀時，託管實例按建立的逆序（LIFO）遍歷，並自動呼叫其 `[Symbol.asyncDispose]()` 或 `[Symbol.dispose]()` 方法。

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// 手動銷毀
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

使用 `await using` 時，作用域在區塊結束時自動銷毀：

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... 使用 conn ...
} // 此處作用域被銷毀 — Connection 被清理，DbPool 不受影響
```

作用域銷毀僅影響 Scoped 實例。Singleton 實例歸根容器所有，在容器本身銷毀時才會被銷毀。

### 介面型別映射

當你向 `createContainer<T>()` 傳入介面時，PropertyKey 令牌的型別來源於介面而非透過鏈式累積。這意味著你可以以任意順序註冊和解析令牌：

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
	// 'greeting' 可以參照 'logger'，即使 'logger' 是後註冊的
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('正在建構 greeting...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### 混合令牌策略

你可以混合使用兩種方式——使用類別令牌獲得順序依賴的型別安全，使用 PropertyKey 令牌獲得順序無關的彈性：

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('正在建構 greeting...');
		return 'Hello!';
	});
```

### 捕獲依賴防護

「捕獲依賴」是指長生命週期的服務（Singleton 或 Transient）捕獲了短生命週期的服務（Scoped），使其存活超出預期的作用域。Katagami 在編譯時防止這種情況——Singleton 和 Transient 工廠只會收到限制為非 Scoped 令牌的解析器：

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — Singleton 工廠無法解析 Scoped 令牌
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

而 Scoped 工廠則可以解析 Scoped 和非 Scoped 令牌：

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — Scoped 工廠可以解析 Singleton 令牌
		return new RequestContext();
	});
```

### 選擇性解析（tryResolve）

當需要處理選擇性依賴或想在不拋出錯誤的情況下檢查令牌是否已註冊時，使用 `tryResolve`。與 `resolve` 不同，它對未註冊的令牌回傳 `undefined` 而不是拋出 `ContainerError`：

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

// resolve 對未註冊令牌拋出例外
container.resolve(Analytics); // ContainerError: Token "Analytics" is not registered.

// tryResolve 對未註冊令牌回傳 undefined
const analytics = container.tryResolve(Analytics);
//    ^? Analytics | undefined
if (analytics) {
	analytics.track('event');
}
```

`tryResolve` 對於工廠中的選擇性依賴特別有用。與 `resolve` 不同，它接受未註冊的令牌而不會產生編譯時錯誤：

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('UserService', r => {
		const logger = r.tryResolve(Logger); // 選擇性依賴
		const analytics = r.tryResolve(Analytics); // Analytics 未註冊但不會產生編譯錯誤

		return {
			greet(name: string) {
				logger?.log(`Hello, ${name}`);
				analytics?.track('user_greeted');
			},
		};
	});
```

`tryResolve` 仍會對循環依賴和已銷毀容器/作用域的操作拋出 `ContainerError` — 只有未註冊的令牌才回傳 `undefined`。

## API

### `createContainer<T, ScopedT>()`

建立新的 DI 容器。傳入介面作為 `T` 以定義 PropertyKey 令牌的型別映射。傳入 `ScopedT` 以定義 Scoped PropertyKey 令牌的獨立型別映射（與 `T` 一樣與註冊順序無關）。

### `container.registerSingleton(token, factory)`

將工廠註冊為 Singleton。實例在首次 `resolve` 時建立並快取。回傳容器以支援方法鏈。

### `container.registerTransient(token, factory)`

將工廠註冊為 Transient。每次 `resolve` 都會建立新實例。回傳容器以支援方法鏈。

### `container.registerScoped(token, factory)`

將工廠註冊為 Scoped。在作用域內，實例在首次 `resolve` 時建立並在該作用域內快取。每個作用域維護自己的快取。Scoped 令牌無法從根容器解析。回傳容器以支援方法鏈。

### `container.resolve(token)`

解析並回傳給定令牌的實例。如果令牌未註冊或偵測到循環依賴，則拋出 `ContainerError`。

### `container.tryResolve(token)` / `scope.tryResolve(token)`

嘗試解析給定令牌的實例。如果令牌未註冊，回傳 `undefined` 而不是拋出例外。對於循環依賴或已銷毀容器/作用域的操作仍會拋出 `ContainerError`。

### `container.createScope()`

建立新的 `Scope`（子容器）。作用域繼承父級的所有註冊。Singleton 實例與父級共享，Scoped 實例為作用域本地。

### `Scope`

由 `createScope()` 建立的作用域子容器。提供 `resolve(token)`、`tryResolve(token)`、`createScope()`（用於巢狀作用域）和 `[Symbol.asyncDispose]()`。

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

按建立的逆序（LIFO）銷毀所有託管實例。呼叫每個實例的 `[Symbol.asyncDispose]()` 或 `[Symbol.dispose]()`。冪等——後續呼叫為空操作。銷毀後，`resolve()` 和 `createScope()` 將拋出 `ContainerError`。

### `ContainerError`

用於容器故障的錯誤類別，例如解析未註冊的令牌、循環依賴或對已銷毀容器/作用域的操作。

### `Resolver`

表示傳遞給工廠回呼的解析器的型別匯出。當你需要為接受解析器參數的函式添加型別時很有用。

## 授權條款

MIT
