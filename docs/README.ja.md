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
