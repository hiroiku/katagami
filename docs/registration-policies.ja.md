# 登録の属性と公開操作

> `beforeResolve` は resolver が所属する scope の解決を検査します。呼出者の scope へ resolver を再束縛せず、取得済み値の推移的な権限を再検証しません。要求や権限に依存する処理には scoped、要求に依存しない共有基盤には singleton を使ってください。

登録に属性を添え、解決時の検査と公開する操作を同じ登録から導けます。業務の権限や分類の意味は利用側が決めます。通常の factory と lifetime はそのまま使い、デコレーターや実行時の外部依存は追加しません。

## 属性を登録の近くで宣言する

```ts
import { createContainer, createMetadataKey, createScope } from 'katagami';

const area = createMetadataKey<'core' | 'report'>()('area');
const container = createContainer({ requiredMetadata: [area] })
  .registerScoped('report', () => ({ count: 3 }), {
    metadata: [area('report')],
  });

const scope = createScope(container, {
  beforeResolve(event) {
    if (event.metadata.require(area) !== 'report') throw new Error('利用できない依存です');
  },
});
const count: number = scope.resolve('report').count;
const classification = container.getMetadata('report').require(area);
```

`createMetadataKey<T>()('name')` は、値型の指定とキー名の推論を分けます。名前は string literal または unique symbol を使えます。別名のキーは値型が同じでも必須属性を満たしません。同名のキーを別に作ると型だけでは区別できないため、実行時はキーオブジェクトの同一性で検査します。キーの定義は共有してください。

`requiredMetadata` を設定すると、各登録の第3引数が必須になり、不足は型エラーになります。`.use()` も取り込む全登録を確認します。同じトークンの古い登録も `resolveAll` の対象なので検査します。実行時も欠落・重複・不正な entry を拒否し、`.use()` は全件の検証後に反映します。必須ではない追加属性も登録できます。

`getMetadata(token)` は最後の登録の属性だけを返し、factory を実行しません。未登録なら `ContainerError` です。reader の `get(key)` は未設定なら `undefined`、`require(key)` は未設定なら例外、`has(key)` は存在を返します。reader と entry は読み取り専用ですが、値に渡したオブジェクトの内部までは凍結しません。

## 公開する callable を指定する

```ts
import { createContainer, entrypoint } from 'katagami';
import { createInvocationScope } from 'katagami/invocation';

const container = createContainer()
  .registerScoped('repository', () => ({ read: (id: string) => `report:${id}` }))
  .registerScoped('readReport', entrypoint(resolver => {
    const repository = resolver.resolve('repository');
    return (id: string) => repository.read(id);
  }));

await using calls = createInvocationScope(container);
const report: string = await calls.invoke('readReport', '42');
// @ts-expect-error 非公開の登録は操作として呼び出せない
calls.invoke('repository');
```

`entrypoint(factory)` は関数を返す factory の公開マーカーです。singleton・transient・scoped のいずれにも使え、非同期 factory も利用できます。クラスの全メソッドを自動公開しません。公開する操作の関数を factory が明示して返します。`invoke` は入力と結果を推論し、同期の操作でも `Promise` を返します。

公開マーカーは実体生成前に検査します。`.use()` や追加登録で最後の登録が非公開になれば、古い型を保持する mutable alias から呼ばれても実行時に拒否します。公開済み関数そのもの、resolver、登録マップは view へ返しません。ただし操作自身が依存の実体を戻り値に含めることは防げません。入力・出力の契約と業務認可は利用側が所有します。

## 同じ scope の view と終了

```ts
import { createContainer, createScope, entrypoint } from 'katagami';
import { invocation } from 'katagami/invocation';

const container = createContainer()
  .registerScoped('request', () => ({ id: Math.random() }))
  .registerScoped('readId', entrypoint(r => () => r.resolve('request').id));
const scope = createScope(container);
const request = scope.resolve('request');
await using calls = invocation(scope);
const sameId = await calls.invoke('readId') === request.id;
```

`createInvocationScope(container, options)` は新しい scope を所有します。`invocation(scope)` は既存 scope の実体を共有し、終了処理を元の scope へ委譲します。後から方針を付け替えず、hook は scope を作る時点で指定します。

`invocation(scope)` は同じ scope について同じ view を返し、ESM/CJS の混在でも実行中操作と終了状態を共有します。

view の終了開始時に新規 `invoke` を拒否し、実行中操作が完了してから元の scope を破棄します。実行中操作は `await` 後も内部 resolver を使えます。終了は冪等です。元の scope を先に直接破棄すれば実行中操作も影響を受けるため、view 経由の処理がある場合は view の終了を待ってください。singleton の所有者は元の container のままです。

raw container/scope を別に渡した経路には公開制限を適用しません。view は JavaScript のセキュリティーサンドボックスではありません。

## 解決 hook の範囲

`beforeResolve` は同期関数です。拒否する場合は例外を投げ、許可する場合は何も返しません。非同期 hook は拒否します。

検査対象は `resolve`、`resolveAll`、`tryResolve`、`tryResolveAll` の登録済み依存で、キャッシュ返却前にも実行します。未知のトークンに対する optional 解決は従来どおり `undefined` です。子 scope は親の方針を継承し、追加 hook で親の検査を外せません。

event は `token`、`lifetime`、`metadata`、`entrypoint`、`requester`、`path` を持ちます。factory の resolver は呼出元を保持するため、`await` 後の解決でも情報は失われません。キャッシュ済み実体が保持する別の実体や、解決済み `lazy` のメソッド実行には新しい解決が発生しません。そこまでの業務認可を hook だけで保証するものではありません。

## 型情報を維持する

登録チェーンと `.use()` の戻り値を推論させてください。`RegisteredTokens<typeof container>` は実登録したトークン型を取得できます。事前宣言サービス型は従来どおり登録済みである証明にはなりません。

既存の `Container<T>` 注釈へ代入すると、従来の resolver 用の型は保たれますが登録履歴は消去されます。消去した履歴を必須属性や公開操作の根拠には使いません。その後に明示的に追加した公開操作は推論されます。`new Container()` からの新しい登録も同様です。`.use()` の必須属性保証を必要とする場合は `createContainer()` の推論を維持してください。

事前宣言型と必須属性を併用する場合は、部分型引数推論に頼らずすべてを指定します。

```ts
import { createContainer, createMetadataKey } from 'katagami';
const area = createMetadataKey<string>()('area');
interface Dependencies { clock: () => number }
const container = createContainer<Dependencies, Record<never, never>, readonly [typeof area]>({
  requiredMetadata: [area],
}).registerScoped('now', resolver => resolver.resolve('clock')(), {
  metadata: [area('core')],
});
```

mutable alias による任意の変更、値が広く宣言された配列、型アサーションまで型で完全に証明することはできません。実行時検査を併用し、登録を組み終えてから scope を作ってください。

### singleton と方針の所有

singleton の factory が resolver を closure に保持した場合、その resolver は生成元 scope に所属し続けます。別の scope から singleton を取得して呼び出しても、後続の `resolve` は生成元 scope の hook を使います。生成元を終了すればその resolver は使えません。呼出者への再束縛を実装しているわけではありません。

singleton の factory が後から実行する callback に resolver を保持し、その callback から scoped 依存を取得する場合も captive dependency として拒否します。従来は同期生成中だけだった検査が、保持した resolver と `await` 後にも継続します。要求内の処理を行う callback 自体を scoped にするか、生成時に適切な寿命の依存を注入してください。

要求ごとの権限で解決を変えたい処理を singleton に入れないでください。次の例では共有する値だけを singleton とし、操作と依存の取得は scope ごとに行います。

```ts
import { createContainer, entrypoint } from 'katagami';
import { createInvocationScope } from 'katagami/invocation';
const container = createContainer()
  .registerSingleton('configuration', () => ({ label: 'report' }))
  .registerScoped('read', entrypoint(r => () => r.resolve('configuration').label));
await using request = createInvocationScope(container, {
  beforeResolve(event) {
    if (event.token !== 'configuration' && event.token !== 'read') throw new Error('利用できません');
  },
});
const label = await request.invoke('read');
```
