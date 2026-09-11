---
title: "AIエージェントが書く依存関係を、TypeScriptの型で検証する"
emoji: "🧩"
type: "tech"
topics: ["typescript", "ai", "di"]
published: false
---

# AIエージェントが書く依存関係を、TypeScriptの型で検証する

AIとコードを書くときも、変更の正しさを確認する手段が必要です。依存関係の配線なら、
コードを変更し、TypeScriptを実行し、診断に沿って修正する流れを作れます。
私が開発しているDIコンテナのKatagamiは、依存を登録するたびに型を積み上げ、
ファクトリから参照できる依存を型として表現します。

## 登録から型を積み上げる

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('users', () => ({ find: (id: string) => `user-${id}` }))
  .registerScoped('handler', r => (id: string) => r.resolve('users').find(id));

createScope(container).resolve('handler')('42');
```

この例にサービス一覧のインターフェースはありません。usersを登録すると、次のファクトリで
usersを参照できる型になります。r.resolve('user')と書き間違えたり、usersの登録を削除したり
すると、依存を使う側で型エラーが出ます。起動せずに確認できる検査です。

## ライフタイムの誤りを検出する

リクエスト固有の状態を、すべてのリクエストで共有するSingletonが保持すると問題になります。

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('requestId', () => crypto.randomUUID())
  // @ts-expect-error — SingletonのファクトリにはScopedのトークンが見えない
  .registerSingleton('handler', r => r.resolve('requestId'));
```

この場合、r.resolve('requestId')でNo overload matches this callという診断が出ます。
handlerがリクエストの状態を保持するなら、registerScopedに変えるのが修正です。
状態を保持する必要がなければ、共有サービスのメソッドへrequestIdを引数で渡す設計もできます。

@ts-expect-errorは、この記事の失敗例をCIで検証するための注記です。
実際のアプリでは注記でエラーを隠さず、依存関係やライフタイムを直します。

## エージェントに渡すもの

現行APIの説明、アプリの依存登録箇所、型チェックとテストのコマンドを渡します。
エージェントには推論された型を保ち、渡されたファクトリのリゾルバを使ってもらいます。
変更後にnpx tsc --noEmitとアプリのテストを実行し、問題があれば修正します。

[実行可能なスターター](https://github.com/hiroiku/katagami/tree/master/examples/request-scope)には、
リクエストごとの状態、テスト用のリポジトリ差し替え、成功・失敗時のリソース破棄を含めました。
AI向けの利用ガイドもnpmパッケージに同梱します。

## 型で保証できる範囲を分ける

デフォルトの蓄積方式では、リテラルキーやunique symbolの型を保つことで、見えている登録集合に
含まれないトークンを拒否できます。一方、createContainer<Services>()で事前宣言する方式は、
後から登録する依存を参照できる代わりに、全キーの実際の登録までは証明しません。

クラストークンには構造的型付けも関係します。同じ構造の別クラスは型として互換でも、
実行時には別のトークンです。この区別が必要なら、unique symbolやリテラルキー、
個別のprivateメンバーで区別したクラスを使います。
[保証と例外](https://github.com/hiroiku/katagami/blob/master/docs/type-safety.md)をコード付きで整理しています。

型チェックの例と実行テストは自動検証しています。ただし、AIの修正成功率やトークン消費の改善は
まだ測定していません。同じ課題・モデル・条件で失敗も含めて記録する評価手順を用意しています。

依存が少なければ、普通の関数やコンストラクタの引数でも十分です。
依存の構築・共有・リクエスト単位の管理が増えた場面で、選択肢として試してもらえればと思います。

```sh
npm install katagami
```

[KatagamiのREADME](https://github.com/hiroiku/katagami)から、基本例と利用ガイドを読めます。
