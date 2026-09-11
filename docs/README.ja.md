[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**TypeScriptの型安全な依存性注入（DI）コンテナ。**

AIエージェントが書くコードでも、依存関係の配線を明示し、型で検証できます。Katagamiは登録するたびに型が自動的に積み上がり、ファクトリから参照できる依存と非同期の戻り値を追跡します。デコレータ・reflect-metadata・ランタイム依存パッケージは不要です。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## クイックスタート

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## Katagamiを選ぶ理由

Katagamiの強みは、**登録からの型推論・コンパイル時のスコープ制約・ランタイム依存ゼロ**を、通常のTypeScriptファクトリで組み合わせられることです。

- **登録した型がそのまま使える。** リテラルキーやunique symbolの型を保てば、登録集合にない必須トークンは型エラーになります。
- **リクエストの状態を型で分離できる。** Singleton・Transientのファクトリに渡されるresolverからは、Scopedのトークンを解決できません。
- **デコレータ設定が不要。** DIのための`experimentalDecorators`・`emitDecoratorMetadata`・Reflectポリフィルを追加する必要がありません。
- **必要な機能だけ取り込める。** コア・`katagami/disposable`・`katagami/lazy`を別々にインポートできます。ESMと`sideEffects: false`でツリーシェイキングに対応し、破棄はホストのdisposalシンボルと`await using`に連携します。

### 他ライブラリとの比較

**8ライブラリ・27項目の比較。2026-09-11確認。** 表中のnpm `latest`安定版と公式資料をもとにしています。[対象バージョン・出典・詳細な注記](./choosing-di.md#comparison-sources)。

**✅ 標準で対応 · ⚠️ 条件付き・異なるモデル・利用側での合成 · ➖ その機能の標準対応なし。** 各セルに具体的なAPIや条件を添えています。

#### 型安全性・導入設定

| 比較項目 | **Katagami**<br>**3.0.3** | InversifyJS<br>8.2.3 | tsyringe<br>4.10.0 | TypeDI<br>0.10.0 | Awilix<br>13.0.5 | NestJS<br>12.0.1 | Effect<br>3.22.2 | typed-inject<br>5.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ランタイム要件** | **✅ 通常のTypeScript** | ⚠️ クラスDIにReflectメタデータ | ⚠️ クラスDIにReflectメタデータ | ⚠️ Reflectメタデータ設定 | ✅ DIメタデータ不要 | ⚠️ Nestモジュール・メタデータ | ✅ Effect・Layer API | ✅ 通常のTypeScript |
| **注入方式** | **明示的なファクトリ・コンストラクタ** | コンストラクタ・プロパティ・ファクトリ | コンストラクタ・ファクトリ | コンストラクタ・プロパティ・ファクトリ | Proxy・Classic・ファクトリ | コンストラクタ・プロパティ・ファクトリ | 関数型サービス・Layer | コンストラクタ・ファクトリ＋`inject` |
| **トークンの種類** | **クラス・文字列・数値・symbol** | クラス・文字列・symbol | クラス・文字列・symbol | クラス・文字列・`Token<T>` | 文字列・symbol | クラス・文字列・symbol | `Context.Tag` | 文字列リテラル |
| **型安全性** | **✅ サービス推論＋スコープ検査** | ✅ 型付き識別子・binding | ✅ クラス・ジェネリック | ✅ クラス・`Token<T>` | ✅ cradleの推論 | ✅ 型付きprovider | ✅ サービス要求の型検査 | ✅ トークン＋`inject`タプル |
| **登録からの型の蓄積** | **✅ トークンの型を蓄積** | ➖ | ➖ | ➖ | ✅ `register` → cradle | ➖ | ⚠️ Layerの要求型 | ✅ トークンの型を蓄積 |
| **未登録の必須トークンをコンパイル時に検出¹** | **✅ リテラル・unique symbol** | ➖ 実行時に検査 | ➖ 実行時に検査 | ➖ 実行時に検査 | ⚠️ cradleでの参照のみ | ➖ 実行時の依存グラフ | ✅ 未充足のサービス要求 | ✅ リテラルキー |
| **Singleton・TransientからのScoped参照を型で制限¹** | **✅ Scopedトークンを除外** | ➖ | ➖ | ➖ | ⚠️ strictモードで実行時検査 | ⚠️ Requestスコープが伝播 | ⚠️ 異なる`Scope`モデル | ➖ Scopedライフタイムなし |
| **ランタイム依存パッケージゼロ²** | **✅** | ➖ | ➖ | ⚠️ Reflectポリフィルを別途導入 | ⚠️ ブラウザ版は構成が異なる | ➖ | ➖ | ✅ |
| **ツリーシェイキング対応²** | **✅ ESM・サブパス・`sideEffects: false`** | ⚠️ ESM・`sideEffects: true` | ⚠️ ESMビルド | ✅ ESM・`sideEffects: false` | ⚠️ ESM・ブラウザビルド | ⚠️ ESM・フレームワーク設定 | ✅ ESM・サブパス・副作用宣言 | ⚠️ ESMビルド |

#### ライフタイム・非同期・リソース破棄

| 比較項目 | **Katagami**<br>**3.0.3** | InversifyJS<br>8.2.3 | tsyringe<br>4.10.0 | TypeDI<br>0.10.0 | Awilix<br>13.0.5 | NestJS<br>12.0.1 | Effect<br>3.22.2 | typed-inject<br>5.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ライフタイム** | **✅ Singleton・Transient・Scoped** | ✅ Singleton・Transient・Request | ✅ Singleton・Transient・Resolution・Container | ✅ 共有・Transient | ✅ Singleton・Transient・Scoped | ✅ Singleton・Transient・Request | ⚠️ メモ化／fresh Layer＋Scope | ✅ Singleton・Transient |
| **リクエスト／Scopedライフタイム³** | **✅ リクエストごとに明示的なScope** | ⚠️ 1回の解決グラフ | ✅ Container／Resolution単位 | ⚠️ 名前付きコンテナ | ✅ リクエストごとに明示的なScope | ✅ HTTPリクエスト単位 | ⚠️ リソースScope | ⚠️ 子injector。Scoped登録なし |
| **子コンテナ／ネストしたスコープ³** | **✅ ネストしたScope** | ✅ コンテナ階層 | ✅ 子コンテナ | ⚠️ 名前付きコンテナ | ✅ 子Scope | ⚠️ モジュール／Requestのコンテキスト | ⚠️ ネストしたリソースScope | ✅ 子injector |
| **非同期ファクトリ** | **✅ Promiseを返すファクトリ** | ✅ 非同期binding | ✅ Promiseを返すファクトリ | ✅ Promise値のサービス | ✅ Promiseを返すファクトリ | ✅ 非同期provider | ✅ Effectによる取得 | ✅ Promiseを返すファクトリ |
| **非同期の戻り値の型追跡** | **✅ `Promise<T>`を推論** | ✅ `getAsync<T>` | ⚠️ Promise値として型付け | ⚠️ Promise値として型付け | ✅ `Promise<T>`を推論 | ⚠️ provider・利用側の型指定 | ✅ 結果・エラー・要求の型 | ✅ `Promise<T>`を推論 |
| **非同期の依存を自動的にawait⁴** | **➖ 明示的に`await`** | ✅ `getAsync`・`getAllAsync` | ➖ 利用側でawait | ➖ 利用側でawait | ➖ 利用側でawait | ✅ 依存元の構築前に待機 | ✅ Effectの合成 | ➖ 利用側でawait |
| **リソース破棄⁵** | **✅ disposalシンボル・`await using`** | ⚠️ Singletonのdeactivation | ✅ 構築したDisposable | ⚠️ reset・削除時の`destroy()` | ⚠️ キャッシュした値＋disposer | ⚠️ アプリのライフサイクルフック | ✅ Scopeのfinalizer | ✅ 所有するDisposable |
| **非同期の破棄完了を待機⁵** | **✅ `Symbol.asyncDispose`** | ✅ 非同期deactivation | ✅ `container.dispose()` | ➖ `destroy()`を待機しない | ✅ `container.dispose()` | ⚠️ アプリのフック。Requestは対象外 | ✅ Effectのfinalizer | ✅ `injector.dispose()` |

#### 合成・拡張機能

| 比較項目 | **Katagami**<br>**3.0.3** | InversifyJS<br>8.2.3 | tsyringe<br>4.10.0 | TypeDI<br>0.10.0 | Awilix<br>13.0.5 | NestJS<br>12.0.1 | Effect<br>3.22.2 | typed-inject<br>5.0.0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **オプショナル解決** | **✅ `tryResolve`・`tryResolveAll`** | ✅ オプショナルget・inject | ✅ オプショナル注入 | ⚠️ `has`で確認して`get` | ✅ `allowUnregistered` | ✅ オプショナル注入 | ✅ `serviceOption` | ⚠️ オプショナル値を合成 |
| **複数登録・一括解決** | **✅ `resolveAll`** | ✅ `getAll`・`getAllAsync` | ✅ `injectAll`・`resolveAll` | ✅ `getMany` | ⚠️ コレクション値を登録 | ⚠️ 配列provider | ⚠️ コレクション値を登録 | ⚠️ コレクション値を登録 |
| **遅延解決⁶** | **✅ `lazy()`・同期クラストークン** | ⚠️ 識別子の遅延・ファクトリ | ✅ `delay()`のProxy | ⚠️ 型の遅延参照 | ⚠️ cradleのプロパティ参照 | ⚠️ `LazyModuleLoader` | ⚠️ Effectの遅延実行 | ⚠️ ファクトリを注入 |
| **条件付きbinding** | **⚠️ トークン分離・ファクトリ内の分岐** | ✅ コンテキスト制約 | ✅ 条件付きファクトリ | ⚠️ ファクトリ内の分岐 | ⚠️ ローカル注入・分岐 | ⚠️ 動的モジュール・ファクトリ | ⚠️ Layerの選択・合成 | ⚠️ ファクトリ内の分岐 |
| **自動ロード／検出⁶** | **➖ 明示的な`use()`** | ⚠️ クラスの自動binding | ➖ 明示的な登録 | ➖ 明示的なimport | ✅ `loadModules`（Node） | ⚠️ `DiscoveryService` | ➖ 明示的なLayer | ➖ 明示的なprovider |
| **モジュールシステム・合成** | **✅ `use()`** | ✅ コンテナモジュール | ✅ `@registry` | ⚠️ 登録をまとめる | ✅ `loadModules`・`register` | ✅ モジュール・動的モジュール | ✅ Layerの合成 | ⚠️ providerチェーンの合成 |
| **循環依存の検出⁷** | **✅ 実行時に循環経路を表示** | ✅ 実行時に検出 | ⚠️ コンストラクタのエラー・`delay` | ⚠️ 型の遅延参照 | ✅ 実行時に循環経路を表示 | ⚠️ 循環エラー・`forwardRef` | ⚠️ Layerの要求型 | ⚠️ 登録順で依存を制限 |
| **ミドルウェア／インターセプタ⁶** | **⚠️ 高階ファクトリで合成** | ✅ activation・deactivationフック | ✅ 解決前後のフック | ⚠️ ファクトリをラップ | ⚠️ ファクトリをラップ | ⚠️ Request用。DIフックとは異なる | ⚠️ Effectを合成 | ⚠️ providerの装飾 |
| **スナップショット／復元⁶** | **➖** | ✅ `snapshot`・`restore` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| **テスト用の差し替え・分離** | **✅ 新しいScope・コンテナ＋`use()`** | ✅ 再binding・スナップショット | ✅ 子コンテナで上書き | ✅ 名前付きコンテナ・reset | ✅ 子Scopeで上書き | ✅ `overrideProvider` | ✅ テスト用Layerに差し替え | ✅ 子injectorで上書き |

**Katagamiの強み：登録型の蓄積・ファクトリのスコープ制約・3つのライフタイム・ランタイム依存ゼロ**を、直接`r.resolve(token)`を呼べるAPIで組み合わせられます。オプショナル／複数解決、モジュール合成、クラスの遅延解決、標準のdisposalシンボルによる破棄も、デコレータ設定なしで利用できます。Awilix・Effect・typed-injectにも、表に示したコンパイル時の検査機能があります。

<details>
<summary>比較の注記：型の保証・スコープ・非同期・各機能の対応範囲</summary>

1. **型の保証：** Katagamiは、型が保たれたリテラルキー・unique symbolを蓄積する方式で未登録トークンを検出します。クラストークン・事前宣言・変更可能な参照には[保証範囲の条件](./type-safety.md)があります。Awilixは未登録のcradleプロパティを拒否しますが、広い`resolve`オーバーロードは未登録名も許可します。Effectは独自のサービス要求を検査します。スコープ制約の行は、Singleton・TransientのresolverからScopedを型で除外する機能の比較です。
2. **導入とバンドル：** メタデータの記述は公式のクラス注入手順が対象です。明示的な値・ファクトリの登録では、各サービスへのデコレータを省ける場合があります。Katagamiのコアにポリフィルは不要ですが、破棄機能には[ホスト・コンパイラの要件](./guide.md#compatibility)があります。ESM・副作用宣言はツリーシェイキングを助ける構成であり、バンドルサイズの実測比較ではありません。
3. **スコープ：** InversifyJSのRequestは1回の解決グラフで、HTTPリクエストとは異なります。名前付きコンテナ・モジュールのコンテキスト・子injector・EffectのリソースScopeも、それぞれ異なる管理方式です。
4. **非同期：** Promiseを返せることと、注入前に依存の完了を自動的に待つことは別です。KatagamiはPromiseを型に残し、`await`を明示します。
5. **破棄：** Katagamiは追加の`disposable()`で`Symbol.dispose`・`Symbol.asyncDispose`・`await using`に連携します。所有権と破棄対象はライブラリごとに異なり、InversifyJSのdeactivationはSingleton、Awilixのdisposerはキャッシュした値が対象です。NestのフックはRequestスコープのクラスには適用されません。
6. **合成と専用API：** サービスの遅延Proxy・型参照の遅延・モジュールの遅延ロードは別の機能です。自動binding・検出も、ファイルの自動ロードとは異なります。Katagamiの`use()`は登録をコピーし、コンテナ自体は変更可能です。ファクトリのラップは専用インターセプタではなく、新しいコンテナでの分離はスナップショットではありません。[合成機能の詳細](./choosing-di.md#composition-and-tooling)。
7. **循環依存：** 実行時の循環検出・参照の遅延・依存の型検査は異なる仕組みです。⚠️は汎用的な循環検出器の存在を意味しません。また、実行時の検出が、あらゆる非同期デッドロックの検出を保証するわけではありません。

</details>

## AIエージェントによるコーディングで役立つ理由

エージェントが依存関係を変更し、TypeScriptの型チェックを実行し、診断をもとに修正する。この手順に、登録漏れやライフタイムの誤用を検出する具体的なチェックを組み込めます。依存関係は通常のTypeScriptのファクトリとして記述します。

例えば、リクエスト固有の状態をSingletonのファクトリから解決しようとすると、型エラーになります。

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

この例では、handlerもregisterScopedで登録すると解決できます。@ts-expect-errorは失敗例をCIで検証するための注記です。実際のアプリではエラーを抑制せず、ライフタイムを修正してnpx tsc --noEmitを実行します。

## 型の蓄積方式と保証範囲

デフォルトのcreateContainer()では、登録から型が積み上がります。リテラルキーやunique symbolの型を保てば、見えている登録集合に含まれないトークンは型エラーになります。事前にサービスの型マップを書く必要はありません。

クラストークンにはTypeScriptの構造的型付けが適用されるため、同じ構造の別クラスを区別できない場合があります。また、createContainer<Services>()で事前宣言したキーは、未登録でも型として見えるようになります。この2つは蓄積方式の通常の登録チェックとは分けて説明しています。

Singleton・Transient・Scoped、use()によるモジュール合成、非同期ファクトリ、複数・オプショナル解決、リソース破棄、遅延解決をサポートします。依存が少ない場合は、通常の引数やコンストラクタによる受け渡しでも十分です。

## ガイドと実行可能な例

- [AIコーディングガイド（英語）](./ai-coding-agents.md)
- [型の保証範囲（英語）](./type-safety.md)
- [API・利用ガイド（英語）](./guide.md)
- [リクエストスコープのスターター（英語）](../examples/request-scope/README.md)
- [DIの選び方（英語）](./choosing-di.md)
- [AIと型に関する日本語記事](./articles/ai-coding-agents.ja.md)

サンプルの型チェックと実行テストはCIで検証します。AIの修正成功率やトークン削減効果は未測定であり、性能向上の数値は主張していません。

名前の由来は、伝統的な染色で模様を写す「型紙」です。型紙を重ねるように、登録ごとに型が積み上がります。

MIT
