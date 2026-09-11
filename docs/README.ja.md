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

**2026-09-11確認。** npmの`latest`安定版と公式資料をもとに、標準APIの動作を比較しています。[対象バージョン・出典・詳細な注記](./choosing-di.md#comparison-sources)も参照してください。

| ライブラリ／確認した版 | 依存の型付けと登録漏れ | スコープの扱い | DIの導入設定 |
| --- | --- | --- | --- |
| **Katagami 3.0.2** | **リテラル・unique symbolの登録型を蓄積し、未登録の必須トークンを拒否** | **Singleton・TransientのresolverからScopedを型で除外** | **デコレータ・メタデータ不要、ランタイム依存ゼロ** |
| InversifyJS 8.2.3 | 型付きの識別子・binding。登録の有無は実行時に確認 | bindingのスコープ指定。resolverの型では分離しない | クラス注入はメタデータ方式。明示的な値・ファクトリbindingも可能 |
| tsyringe 4.10.0 | クラス・ジェネリックの型を利用。登録の有無は実行時に確認 | 実行時のライフタイム設定。ファクトリにはコンテナを渡す | クラス注入にデコレータとReflectメタデータのポリフィル |
| TypeDI 0.10.0 | クラス・`Token<T>`の型を利用。登録の有無は実行時に確認 | 共有・Transientと名前付きコンテナ | TypeScriptの導入手順はデコレータと`reflect-metadata`を使用 |
| Awilix 13.0.5 | 登録からcradleの型を推論。`resolve`の広いオーバーロードは未登録名も許可 | `strict: true`でライフタイム漏れを実行時に検出 | デコレータ・メタデータ不要 |
| NestJS 12.0.1 | 型付きprovider。モジュールとproviderの依存グラフは実行時に解決 | Requestスコープが依存元へ伝播 | フレームワークのモジュールとメタデータ方式のクラス注入 |
| Effect 3.22.2 | `Effect`・`Layer`の型で必要なサービスを追跡 | 型付き`Scope`とfinalizer。DIコンテナとは異なるライフタイムモデル | デコレータ・メタデータ不要。Effectのサービス・Layerを使用 |
| typed-inject 5.0.0 | 文字列トークンを蓄積し、`inject`タプルも検査 | Singleton・Transientと子injector。独立したScoped登録はない | デコレータ・メタデータ不要、ランタイム依存ゼロ |

Awilixのcradle推論、typed-injectの登録検査、Effectのサービス要求の型検査も、それぞれコンパイル時の機能です。Katagamiは、**登録集合とスコープ制約を、直接`r.resolve(token)`を呼べるファクトリAPIで組み合わせられる**点を重視しています。[型の保証範囲](./type-safety.md)にあるクラストークン・事前宣言・変更可能な参照の条件も適用されます。

| ライブラリ | ライフタイム／スコープ | 非同期サービス | リソース破棄 |
| --- | --- | --- | --- |
| **Katagami** | **Singleton・Transient・Scoped、ネストしたスコープ** | **`Promise<T>`を推論。依存は明示的にawait** | **`disposable()`でdisposalシンボルと`await using`に連携** |
| InversifyJS | Singleton・Transient・Request（1回の解決グラフ）、コンテナ階層 | `getAsync`・`getAllAsync`が依存の完了を待機 | Singletonのdeactivation handler |
| tsyringe | Singleton・Transient・ResolutionScoped・ContainerScoped | Promiseを返すファクトリを登録可能。利用側で処理 | 構築したDisposableを`container.dispose()`で破棄 |
| TypeDI | 共有・Transient、名前付きコンテナ | Promiseをサービス値として扱い、利用側で処理 | reset・削除時に`destroy()`を呼べるが、戻り値のPromiseは待機しない |
| Awilix | Singleton・Transient・Scoped | Promiseを返すファクトリを登録可能。利用側で処理 | キャッシュしたSingleton・Scopedに登録済みdisposerを適用 |
| NestJS | Singleton・Transient・HTTPリクエスト、スコープ伝播 | 依存providerの非同期初期化を待ってから構築 | アプリのライフサイクルフック。Requestスコープのクラスは対象外 |
| Effect | メモ化されたLayerと明示的なリソーススコープ | 非同期処理を含むEffectによる取得 | Scopeのfinalizerと`acquireRelease` |
| typed-inject | Singleton・Transient、破棄可能な子injector | ファクトリが返すPromiseの型も推論 | 所有するインスタンスの`dispose()`をawait |

InversifyJSのRequestは1回の解決グラフであり、HTTPリクエストとは異なります。また、Promiseを値として返せることと、依存のPromiseを自動的に待って注入することは別の機能です。[モジュール合成・複数解決・拡張機能の比較](./choosing-di.md#composition-and-tooling)も掲載しています。

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
