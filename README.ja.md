[English](./README.md) | [日本語](./README.ja.md)

# Katagami

軽量な TypeScript DI コンテナ。完全な型推論をサポートします。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> 名前の由来は「型紙」— 伝統的な染色で精密な模様を布に写し取るための型抜き紙です。複数の型紙を重ねて精緻な文様を構成するように、メソッドチェーンの各呼び出しで型が蓄積されます。型紙は紙と刷毛さえあれば成立し、大掛かりな装置を必要としません。Katagami もデコレータやメタデータの仕組みに依存せず、どのビルドツールでもそのまま動作します。そして、異なる生地や技法に対応する型紙のように、Katagami は TypeScript と JavaScript、クラストークンと PropertyKey トークンに対応する、ハイブリッドで厳密な DI を実現します。

## 特徴

| 機能                     | 説明                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| 完全な型推論             | メソッドチェーンで型が蓄積され、未登録トークンの解決はコンパイル時エラーになる                |
| 3 つのライフタイム       | Singleton、Transient、Scoped（子コンテナ対応）                                                |
| 非同期ファクトリ         | Promise を返すファクトリは型システムが自動的に追跡                                            |
| 循環依存の検出           | 循環パスの全体を含む明確なエラーメッセージ                                                    |
| Disposable サポート      | TC39 Explicit Resource Management（`Symbol.dispose` / `Symbol.asyncDispose` / `await using`） |
| ハイブリッドトークン戦略 | クラストークンで厳密な型安全性、PropertyKey トークンで柔軟性                                  |
| インターフェース型マップ | `createContainer<T>()` にインターフェースを渡して登録順序非依存に                             |
| ゼロ依存                 | デコレータ不要、reflect-metadata 不要、ポリフィル不要                                         |

## インストール

```bash
npm install katagami
```

## クイックスタート

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
//    ^? UserService（完全に推論される）
userService.greet('world');
```

## なぜ Katagami なのか

多くの TypeScript DI コンテナはデコレータ、reflect-metadata、または文字列ベースのトークンに依存しており、ツールの互換性・型安全性・バンドルサイズのいずれかにトレードオフが生じます。Katagami は異なるアプローチを採用しています。

### デコレータ不要、reflect-metadata 不要

デコレータベースの DI には `experimentalDecorators` と `emitDecoratorMetadata` コンパイラオプションが必要です。esbuild や Vite（デフォルト設定）などのモダンなビルドツールは `emitDecoratorMetadata` をサポートしておらず、TC39 標準デコレータ提案にもデザインタイム型情報の自動出力に相当する機能は含まれていません。Katagami はこれらに一切依存しないため、どのビルドツールでもそのまま動作します。

### クラストークンによる完全な型推論

文字列トークンの DI では、トークンと型の手動マッピングを維持する必要があります。パラメータ名によるマッチングは、ミニファイ時に壊れます。Katagami はクラスを直接トークンとして使用するため、`resolve` は正しい戻り値の型（同期または `Promise`）を自動的に推論します。追加のアノテーションは不要です。

### メソッドチェーンによる型の蓄積

`register` を呼び出すたびに型が蓄積されます。ファクトリ内では、リゾルバはチェーンのその時点までに登録されたトークンのみを受け付けます。未登録のトークンを解決しようとすると、実行時エラーではなくコンパイル時エラーになります。

### ハイブリッドトークン戦略

クラストークンでは、メソッドチェーンによる厳密な順序依存の型安全性が得られます。一方、サービス群を先に定義して任意の順序で登録したい場合もあるでしょう。`createContainer<T>()` にインターフェースを渡して PropertyKey トークンを使えば、型マップは作成時に固定されるため、登録順序は問題になりません。

### ゼロ依存

ランタイム依存なし、ポリフィルなし。reflect-metadata（未ミニファイで約 50 KB）をバンドルに追加する必要はありません。

## ガイド

### Singleton と Transient

Singleton は最初の `resolve` でインスタンスを作成しキャッシュします。Transient は毎回新しいインスタンスを作成します。

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

// Singleton — 常に同じインスタンス
container.resolve(Database) === container.resolve(Database); // true

// Transient — 毎回新しいインスタンス
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Scoped ライフタイムと子コンテナ

Scoped 登録はスコープ内では Singleton のように振る舞いますが、新しいスコープでは新しいインスタンスを生成します。`createScope()` で子コンテナを作成します。Scoped トークンはルートコンテナからは解決できません。

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

// リクエストごとにスコープを作成
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — 同じスコープ内では同一、スコープ間では別インスタンス
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — すべてのスコープで共有
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

スコープはネストも可能です。ネストされたスコープは独自の Scoped インスタンスキャッシュを持ちつつ、Singleton は親と共有します：

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// ネストされたスコープはそれぞれ独自の Scoped インスタンスを持つ
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singleton は引き続き共有
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### 非同期ファクトリ

`Promise` を返すファクトリは型システムによって自動的に追跡されます。非同期トークンを `resolve` すると、戻り値の型は `V` ではなく `Promise<V>` になります：

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
		await new Promise(r => setTimeout(r, 100)); // 非同期初期化をシミュレート
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>（await 後 → Database）
db.connected; // true
```

非同期ファクトリは同期・非同期両方の登録に依存できます：

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // 同期 → Logger
		logger.log('接続中...');
		return new Database(true);
	});
```

### 循環依存の検出

Katagami は解決中のトークンを追跡します。循環依存が検出されると、循環パスの全体を含む `ContainerError` がスローされます：

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

間接的な循環も検出されます：

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Disposable サポート

`Container` と `Scope` は `AsyncDisposable` を実装しています。破棄時に、管理対象のインスタンスを逆順（LIFO）で走査し、`[Symbol.asyncDispose]()` または `[Symbol.dispose]()` を自動的に呼び出します。

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// 手動で破棄
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

`await using` を使うと、ブロックの終了時にスコープが自動的に破棄されます：

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... conn を使用 ...
} // ここでスコープが破棄される — Connection はクリーンアップされ、DbPool はされない
```

スコープの破棄は Scoped インスタンスのみに影響します。Singleton インスタンスはルートコンテナに所有されており、コンテナ自体が破棄されたときに破棄されます。

### インターフェース型マップ

`createContainer<T>()` にインターフェースを渡すと、PropertyKey トークンはチェーンによる蓄積ではなく、インターフェースから型が決定されます。これにより、トークンを任意の順序で登録・解決できます：

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
	// 'greeting' は 'logger' より先に登録されていても参照できる
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('greeting を構築中...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### ハイブリッドトークン戦略

両方のアプローチを組み合わせることもできます — クラストークンで順序依存の型安全性を、PropertyKey トークンで順序非依存の柔軟性を活用できます：

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('greeting を構築中...');
		return 'Hello!';
	});
```

## API

### `createContainer<T>()`

新しい DI コンテナを作成します。PropertyKey トークンの型マップを定義するには、インターフェースを `T` として渡します。

### `container.registerSingleton(token, factory)`

ファクトリをシングルトンとして登録します。インスタンスは最初の `resolve` 時に作成され、以降はキャッシュされます。メソッドチェーン用にコンテナを返します。

### `container.registerTransient(token, factory)`

ファクトリをトランジェントとして登録します。`resolve` のたびに新しいインスタンスが作成されます。メソッドチェーン用にコンテナを返します。

### `container.registerScoped(token, factory)`

ファクトリをスコープ付きとして登録します。スコープ内では最初の `resolve` でインスタンスが作成され、そのスコープ内でキャッシュされます。各スコープは独自のキャッシュを持ちます。Scoped トークンはルートコンテナからは解決できません。メソッドチェーン用にコンテナを返します。

### `container.resolve(token)`

指定されたトークンのインスタンスを解決して返します。トークンが未登録の場合、または循環依存が検出された場合に `ContainerError` をスローします。

### `container.createScope()`

新しい `Scope`（子コンテナ）を作成します。スコープは親のすべての登録を継承します。Singleton インスタンスは親と共有され、Scoped インスタンスはスコープ内でローカルになります。

### `Scope`

`createScope()` で作成されるスコープ付き子コンテナです。`resolve(token)`、`createScope()`（ネストスコープ用）、`[Symbol.asyncDispose]()` を提供します。

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

管理対象のインスタンスを逆順（LIFO）で破棄します。各インスタンスの `[Symbol.asyncDispose]()` または `[Symbol.dispose]()` を呼び出します。冪等 — 2 回目以降の呼び出しは何もしません。破棄後は `resolve()` と `createScope()` が `ContainerError` をスローします。

### `ContainerError`

未登録トークンの解決、循環依存、破棄済みコンテナ/スコープの操作など、コンテナの障害時にスローされるエラークラスです。

## ライセンス

MIT
