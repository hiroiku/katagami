# Katagami DI コンテナ機能拡張提案

## 現状の整理

現在の Katagami は約 200 行の軽量実装で、以下をサポート:

- Singleton / Transient の 2 種のライフタイム
- ファクトリ関数ベースの登録 (`registerSingleton`, `registerTransient`)
- クラストークン / PropertyKey トークン
- 非同期ファクトリ
- メソッドチェーンによるフルな型推論

---

## A. 既存 DI コンテナにはあるが、Katagami にない機能

### A1. Scoped ライフタイム + 子コンテナ (Child Container)

- **概要**: 親コンテナの登録を継承しつつ、スコープ内で Singleton のように振る舞うライフタイム。Web アプリのリクエスト単位でのインスタンス管理に不可欠
- **API 案**:

```typescript
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, () => new RequestContext());

// リクエストごとにスコープを作成
const scope = root.createScope();
scope.resolve(RequestContext); // スコープ内で1つ
scope.resolve(DbPool); // 親のSingletonを返す
```

- **参考**: InversifyJS, tsyringe, .NET DI, NestJS すべてが持つ標準機能

### A2. 循環依存の検出

- **概要**: 現状は循環依存があるとスタックオーバーフローになる。解決中のトークンをトラッキングし、循環を検出して明確なエラーメッセージを出す
- **API 案**: 内部実装の改善。`resolve`時にスタックを追跡し、`ContainerError`で循環パスを含むメッセージを投げる

```
ContainerError: Circular dependency detected: ServiceA -> ServiceB -> ServiceA
```

### A3. Disposable サポート (リソース破棄)

- **概要**: TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose`) と統合。コンテナやスコープの破棄時に、登録済みインスタンスの `dispose()` を自動呼び出し
- **API 案**:

```typescript
const scope = root.createScope();
// ... 利用 ...
await scope[Symbol.asyncDispose](); // スコープ内のインスタンスを自動破棄

// using 構文との統合
await using scope = root.createScope();
```

- **参考**: .NET DI の `IDisposable`、tsyringe の `dispose()`

### A4. Optional 解決 (tryResolve)

- **概要**: 未登録トークンで例外を投げる代わりに `undefined` を返すメソッド
- **API 案**:

```typescript
const result = container.tryResolve(ServiceA); // ServiceA | undefined
```

### A5. 複数実装の登録と一括解決 (Multi-binding / resolveAll)

- **概要**: 1 つのトークンに複数の実装を登録し、配列として一括解決。プラグインシステムやミドルウェアパターンに有用
- **API 案**:

```typescript
const container = createContainer()
	.register(EventHandler, () => new LogHandler())
	.register(EventHandler, () => new MetricsHandler());

container.resolveAll(EventHandler); // [LogHandler, MetricsHandler]
```

### A6. コンテナの凍結 (freeze)

- **概要**: 凍結後は新規登録を禁止。アプリ起動後に意図しない登録変更を防ぐ安全装置
- **API 案**:

```typescript
const container = createContainer()
	.registerSingleton(ServiceA, () => new ServiceA())
	.freeze(); // 以降のregisterは ContainerError をスロー

// TypeScript型レベルでも register メソッドを除去可能
```

### A7. モジュールシステム

- **概要**: 関連する登録をモジュールとしてグループ化し、再利用可能にする
- **API 案**:

```typescript
const authModule = defineModule(c =>
	c.registerSingleton(AuthService, () => new AuthService()).registerSingleton(TokenService, () => new TokenService()),
);

const container = createContainer().use(authModule).use(dbModule);
```

---

## B. 他の DI コンテナにはない独自機能

### B1. 型レベル依存グラフ検証 (Compile-time Dependency Validation)

- **概要**: Katagami のメソッドチェーンによる型の蓄積を活かし、ファクトリ内で未登録トークンを解決しようとするとコンパイルエラーにする仕組みを強化。現在も部分的にあるが、さらに「すべての依存が解決可能か」をビルド時に保証する
- **独自性**: 他の DI コンテナはランタイムエラーに依存。TypeScript の型システムだけで依存の完全性を保証できるのは Katagami のアーキテクチャならでは

### B2. 型安全なコンテナマージ

- **概要**: 2 つのコンテナを型安全にマージ。マイクロサービスやモノレポで、機能別にコンテナを構築して統合するユースケース
- **API 案**:

```typescript
const infraContainer = createContainer().registerSingleton(Database, () => new Database());

const appContainer = createContainer().registerSingleton(UserService, r => new UserService(r.resolve(Database)));

const merged = infraContainer.merge(appContainer);
// merged の型は両方のトークンを持つ
```

- **独自性**: 型レベルでのマージ結果の推論は他にない

### B3. 解決ミドルウェア / インターセプター

- **概要**: `resolve` 時にミドルウェアを挟む。ロギング、プロファイリング、キャッシュ、AOP 的な横断的関心事の実装に使用
- **API 案**:

```typescript
const container = createContainer()
	.registerSingleton(ServiceA, () => new ServiceA())
	.use(loggingMiddleware()) // resolve 時にログ出力
	.use(profilingMiddleware()); // 解決時間を計測
```

### B4. Snapshot / Restore (テスト支援)

- **概要**: コンテナの状態をスナップショットとして保存し、後から復元する。テスト間のコンテナ状態のリセットに最適
- **API 案**:

```typescript
const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());

const snapshot = container.snapshot();

// テストでモックに差し替え
container.registerSingleton(ServiceA, () => new MockServiceA());

// テスト後に復元
container.restore(snapshot);
```

- **独自性**: DI 固有のスナップショット機構は他にない。テスト体験の大幅改善

### B5. 遅延解決プロキシ (Lazy Resolution)

- **概要**: `resolve` 時にインスタンスを生成せず、最初のプロパティアクセス時に遅延生成する。起動時間の最適化や循環依存の回避に有効
- **API 案**:

```typescript
const container = createContainer().registerSingleton(HeavyService, () => new HeavyService());

const lazy = container.lazy(HeavyService);
// まだインスタンスは生成されていない
lazy.doSomething(); // ここで初めて生成・キャッシュ
```

- **独自性**: Proxy ベースの遅延解決を型安全に提供する DI コンテナは存在しない

### B6. 依存グラフのイントロスペクション

- **概要**: ランタイムで依存グラフを検査・可視化する API。デバッグや開発ツールとの連携に有用
- **API 案**:

```typescript
container.inspect();
// => { token: ServiceC, deps: [ServiceB], lifetime: 'singleton' }
// Mermaid / DOT 形式でグラフ出力も可能
container.inspect().toMermaid();
```

---

## 推奨する優先度

- **高**
  - A2. 循環依存検出 — 安全性の基本。現状はサイレント障害
  - A1. Scoped + 子コンテナ — Web アプリでの実用性に直結
  - A3. Disposable サポート — TC39 標準との統合、モダン JS 必須
  - B1. 型レベル依存検証 — Katagami の最大の差別化ポイント
- **中**
  - A4. tryResolve — 実装コスト低、利便性高
  - A6. freeze — 実装コスト低、安全性向上
  - B4. Snapshot/Restore — テスト体験の大幅改善
  - B5. Lazy Resolution — パフォーマンス最適化
  - A7. モジュールシステム — 大規模アプリでの再利用性
- **低**
  - A5. Multi-binding — ユースケースが限定的
  - B2. コンテナマージ — モジュールシステムと重複しうる
  - B3. ミドルウェア — 高度な用途向け
  - B6. グラフイントロスペクション — 開発ツール用途
