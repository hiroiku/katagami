[English](./README.md) | [日本語](./README.ja.md)

# Katagami

軽量な TypeScript DI コンテナ。完全な型推論をサポートします。

> 名前の由来は「型紙」— 伝統的な染色で精密な模様を布に写し取るための型抜き紙です。複数の型紙を重ねて精緻な文様を構成するように、メソッドチェーンの各呼び出しで型が蓄積されます。型紙は紙と刷毛さえあれば成立し、大掛かりな装置を必要としません。Katagami もデコレータやメタデータの仕組みに依存せず、どのビルドツールでもそのまま動作します。そして、異なる生地や技法に対応する型紙のように、Katagami は TypeScript と JavaScript、クラストークンと PropertyKey トークンに対応する、ハイブリッドで厳密な DI を実現します。

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

## インストール

```bash
npm install katagami
```

## 使い方（TypeScript）

クラストークンで完全な型推論を利用できます：

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

## 使い方（JavaScript）

文字列または Symbol トークンを使用します：

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

## 非同期ファクトリ

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

## インターフェース型マップ

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

### `container.resolve(token)`

指定されたトークンのインスタンスを解決して返します。トークンが未登録の場合、`ContainerError` をスローします。

### `ContainerError`

未登録のトークンを解決しようとした際にスローされるエラークラスです。

## ライセンス

MIT
