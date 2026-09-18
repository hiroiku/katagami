# 登録の属性と公開操作

英語版（正本）: [Registration policies and operations](./registration-policies.md)

登録に属性を添え、解決時の検査と公開操作を同じ登録から導けます。共通の方針は `policy` に一度定義し、同じオブジェクト参照を部品へ渡します。対象トークンの一覧を別に管理する必要はありません。属性の意味と許可・拒否の判断は利用側が決めます。

通常の `createContainer()` と `createScope(container)` はそのまま使えます。ここで説明する方針と公開操作は、必要な場合に追加する機能です。

## 同じ方針で部品を組み立てる

```ts
import { createContainer, createMetadataKey, createScope, entrypoint } from 'katagami';
import type { ContainerPolicy } from 'katagami';

const EXPOSURE = createMetadataKey<'internal' | 'public'>()('exposure');
const policy = {
  name: 'reports',
  requiredMetadata: [EXPOSURE] as const,
  beforeReturn({ registrations }) {
    if (registrations.some(registration =>
      registration.metadata.require(EXPOSURE) === 'internal'
    )) {
      throw new Error('内部の依存実体は公開できません');
    }
  },
} satisfies ContainerPolicy;

function createReports(options: { policy: typeof policy }) {
  return createContainer({ policy: options.policy })
    .registerSingleton('repository', () => ({
      read: (id: string) => `report:${id}`,
    }), {
      metadata: [EXPOSURE('internal')],
    })
    .registerScoped('readReport', entrypoint(resolver => {
      const repository = resolver.resolve('repository');
      return (id: string) => ({ id, title: repository.read(id) });
    }), {
      metadata: [EXPOSURE('public')],
    });
}

const container = createContainer({ policy }).use(createReports({ policy }));
await using operations = createScope(container, { access: 'operations' });
const readReport = operations.get('readReport');
const report = await readReport('42');
```

`entrypoint(factory)` は、公開する関数を返す factory のマーカーです。上の例では `readReport` だけを呼び出せます。`repository` を解決するための resolver は factory の内部にとどまり、呼び出す側は普通の引数を渡します。結果は操作が作り、`policy` では変換しません。

`ContainerPolicy` は `satisfies` に使う公開型です。フックの引数に型を付けながら、`requiredMetadata: [EXPOSURE] as const` の具体的なキーを保持します。`const policy: ContainerPolicy` や `as ContainerPolicy` で型を広げると、個々の必須キーについて型検査できなくなります。

部品には元の `policy` 参照を渡してください。`{ policy }` という外側の引数を作り直しても共有は保たれますが、`{ ...policy }` で方針自体をコピーすると別の方針になります。この例の部品は `EXPOSURE` を付与できる方針に対応しており、任意の必須属性を持つ方針への対応を約束するものではありません。

リポジトリー内で実行する例は [examples/registration-policies.ts](https://github.com/hiroiku/katagami/blob/master/examples/registration-policies.ts) にあります。ビルド後、`bun examples/registration-policies.ts` で実行できます。

## 属性と必須キー

`createMetadataKey<T>()('name')` は、値型の指定とキー名の推論を分けます。名前は string literal または unique symbol を使えます。別名のキーは値型が同じでも必須属性を満たしません。同名のキーを別に作ると型だけでは区別できないため、実行時はキーオブジェクトの同一性で検査します。キーの定義も共有してください。

`policy.requiredMetadata` を設定すると、登録の `metadata` に必須キーを含める必要があります。不足は登録時と `.use()` 時に型と実行時の双方で検査します。同じトークンの古い登録も `resolveAll` の対象なので検査から外しません。型から登録履歴が失われても実行時検査は省略しません。重複・不正な entry も拒否し、必須でない追加属性は登録できます。

`container.getMetadata(token)` は最後の登録の属性だけを返し、factory を実行しません。未登録なら `ContainerError` です。reader は次のメソッドを持ちます。

| メソッド | 結果 |
| --- | --- |
| `get(key)` | 属性の値。未設定なら `undefined` |
| `require(key)` | 属性の値。未設定なら例外 |
| `has(key)` | 属性が存在するか |

reader と entry は読み取り専用ですが、属性の値として渡したオブジェクトの内部までは凍結しません。

### `.use()` の条件

| 取り込む部品 | 取り込み先 | 扱い |
| --- | --- | --- |
| 方針なし | 方針なし | 通常の合成 |
| 方針なし | 方針あり | 取り込み先の必須属性を全登録で検査して合成 |
| 同じ方針 | 同じ方針 | 全登録を検査して合成 |
| 異なる方針 | 方針あり | 拒否 |
| 方針あり | 方針なし | 拒否 |

拒否した `.use()` は一部の登録だけを反映しません。合成するのは登録定義であり、部品のキャッシュを取り込み先へ合流させるものではありません。各部品を `createContainer({ policy })` で作れば、部品の登録時点でも属性の付け忘れを検出できます。

## 方針の同一性と設定の固定

同じ元オブジェクト参照の `policy` を使うコンテナーは、設定と実体の出自の記録を共有します。同じ `name` の別オブジェクトは別の方針です。`name` は利用者が方針を見分けるためのラベルです。katagami はエラーやイベントに含めず、共有や認可のキーにもしません。明示的な方針がないコンテナーへ、暗黙の共通返却検査は追加しません。

初回利用時に設定を検証し、必須キーの配列をコピーして内部の設定を固定します。フックもその時点の関数参照を使います。利用者の `policy` オブジェクトや配列を変更・freeze しないため、`Object.freeze` は必要ありません。`as const` や `satisfies` も実行時の freeze を行いません。

初回利用後に元の定義を変更しても、既存コンテナーには反映しません。変更した同じオブジェクトを再び `createContainer({ policy })` へ渡すと拒否します。`name`、必須キーの順序・参照、フック参照を変更したい場合は、新しい方針オブジェクトを用意してください。

設定にはデータプロパティーを使ってください。アクセサーは getter を実行せず拒否します。Proxy であること自体を検出する保証はありません。

フックのクロージャーが参照する状態や、属性値の内部までは固定しません。要求ごとの認可状態は共通方針に閉じ込めず、scope の `beforeResolve` へ渡してください。同じ方針を使っても、別の root の singleton キャッシュ、要求状態、資源の所有権は共有しません。

## 実体の出自と返却検査

### 解決した参照を記録する

同じ方針内で実際に解決された object/function について、参照と、その時点の登録の内容（トークン、lifetime、`entrypoint` の有無、属性）を記録します。文字列、数値、symbol などの primitive は同じ値であっても追跡しません。

- 同じ実体を別名で解決すると、出自を追加します。既存の出自は消しません。
- トークンを上書きしても、生成済み実体の古い出自は残ります。
- 登録の内容がすべて同じ出自は、登録やコンテナーが別でも 1 つにまとめます。要求ごとにコンテナーを作り直しても、1 つの実体の記録は `beforeReturn` が区別できる出自の数を超えて増えません。属性は並びを問わず、キーの参照と値の同一性（`Object.is`）で比べます。要求 ID のように要求ごとに変わる値や、要求ごとに新しく作ったオブジェクトを属性の値やトークンにすると、要求ごとに別の出自として数え、記録もその数だけ増えます。
- 新しい実体は古い実体の出自を引き継ぎません。
- `async` factory または native Promise を返す factory では、完了を待つ chain を katagami が作り、その内側で正常終了した値を記録します。呼び出し元へ渡すのはこの chain の末端であり、factory が返した Promise そのものではありません。その Promise に付けた独自プロパティーは引き継がないため、値として渡したいオブジェクトは Promise 以外の実体か custom thenable にしてください。cache に載るのもこの末端で、同じ scope の再解決では同じ Promise を返します。ただし、返却検査を持つ方針の最上位の解決は、後述のとおり呼び出しごとの Promise を返します。
- キャッシュ、各 lifetime、親子・兄弟 scope、同じ方針を使う別の root でも記録を共有します。別の方針の記録は混ざりません。

同期 factory が返す custom thenable（`then` を持つ独自オブジェクト）は、通常の依存実体としてその参照を記録します。元の実体・キャッシュ・独自メソッドを保ち、`then` やその getter に触れず、完了の購読もしません。その完了値の出自まで自動記録することはありません。完了値を登録した依存として扱いたい場合は、`async () => await thenable` のように既存の非同期 factory で明示してください。

別名を作る場合は、通常の factory の中で元トークンを `resolve` してください。これにより元の出自も観測できます。未実行の factory や、登録を通さず持ち込まれた参照の出自は推測しません。現在の `getMetadata(token)` で古い出自を置き換えることもありません。

記録は実体を不要に生存させないよう弱参照で保持し、scope の終了では消しません。記録が持つのは出自の内容（トークン、lifetime、`entrypoint` の有無、属性のキーと値）だけです。登録、factory とそのクロージャー、キャッシュ、scope、コンテナーは持たないので、実体や方針がコンテナーより長く生きても、これらはコンテナーの寿命を超えて残りません。ただし、トークンや属性の値そのものがコンテナーを参照している場合は、記録を通じて残ります。同じ方針参照を渡す同一パッケージの ESM/CJS 間でも、設定と記録を共有します。別バージョンや別 realm の間まで保証するものではありません。

### 渡した Promise には手を出さない

katagami は、記帳や破棄のために、自分が呼び出し元へ渡した Promise へ `then` / `catch` / `finally` を付けません。記帳は自分が作った chain の内側で済ませ、その末端を渡します。破棄が閉じる対象を知るための生成結果と、終了が進行中の操作を待つための完了通知も、渡した Promise とは別に katagami が自分で持ちます。

このため、渡した Promise を受け取り側が捨てたまま失敗すると、その失敗は処理系の既定どおり未処理の rejection として現れます。scope の破棄や操作用 scope の終了が重なっても、katagami がその失敗を先に受け取ってしまうことはありません。`resolve` の戻り値と操作が返す Promise は、必ず受け取って `await` するか、`catch` で扱ってください。

ただし、singleton と scoped の生成が cache に載せた Promise は、後の解決とも共有します。返却検査を持つ方針の最上位の解決と、操作用 scope の呼び出しは、共有した Promise から自分の Promise を作って待ちます。そのため、先に受け取った呼び出し元が同じ Promise を捨てていても、後の解決が待ち始めた時点でその失敗は処理済みになり、後の解決の呼び出し元へ届きます。別の呼び出し元が同じ Promise を `await` した場合と同じです。

呼び出し元へ渡せなかった生成の失敗も隠しません。`resolveAll` の途中で別の登録が同期的に失敗した場合、先に始まっていた非同期の生成の失敗は未処理の rejection として現れます。singleton と scoped の生成は cache に残るので、同じトークンを解決し直せば同じ失敗を受け取れます。transient は解決のたびに factory を実行し直すため、元の失敗は取り戻せません。

### `beforeReturn` の範囲

`beforeReturn({ registrations })` は、方針が禁じた値をどの面からも外へ出さないための同期検査です。対象は次の 2 つで、どちらも観測済みの出自だけを見ます。

| 面 | 検査する値 |
| --- | --- |
| 通常の resolver 用 scope | `resolve`、`resolveAll`、`tryResolve`、`tryResolveAll` の最上位の解決が返す値 |
| 操作用 scope | 公開操作が直接返す正常終了値 |

factory が要求した解決（`beforeResolve` の `requester` が付く解決）は面の内側なので検査しません。組み立てに必要な依存は factory の中で自由に受け取り、外へ出す値だけを方針が決めます。操作用 scope が公開操作の呼び出し関数を解決する経路も面の内側です。この内部解決は `beforeResolve` からは最上位の解決と同じく `requester` なしに見えるため、面の内外を `beforeResolve` の `requester` だけで判定することはできません。未登録のトークンに対する optional 解決は値を生まないため、検査せずに `undefined` を返します。`lazy` は最初のプロパティーアクセスで `resolve` を呼ぶので、その時点で検査します。

出自を追跡するのは object と function だけです。primitive の結果には空の `registrations` が渡るので、`area` を付けた登録が文字列や数値を返しても、出自による判定では止まりません。factory の resolver 自体を操作の結果やクロージャーで外へ渡した場合も、その resolver からの解決は面の内側として扱われ検査されません。resolver を外へ出さない形で登録してください。factory が、自分を生成している scope の公開メソッドを同期的に呼んだ場合も、その factory の生成の内側の解決として扱います。寿命と循環の検査は働き、返却検査は行いません。

同期 factory の値はその場で検査し、非同期 factory では解決値を検査してから呼び出し元へ渡します。返却検査を持つ方針では、最上位の非同期解決は呼び出しごとに検査するため、同じ生成に対して呼び出しごとの Promise を返します。Promise/thenable を返す操作では結果を `await` し、正常終了値の既知の出自だけを検査します。custom thenable 自身の出自を、その完了値へ推測して引き継ぎません。`registrations` は結果の参照について観測した出自の読み取り専用 snapshot です。操作自身の登録を、結果の出自の代わりに渡すことはありません。primitive と出自が不明な結果では空の配列になります。

許可する場合は何も返さず、拒否する場合は例外を投げます。非同期フックは使えず、戻り値の変換にも使えません。検査が完了するまで値を呼び出し元へ渡さず、拒否した場合は同期の解決なら例外を投げ、非同期の解決と操作なら Promise を reject します。フックが投げたエラーは包まずにそのまま呼び出し元へ届くので、拒否の理由はそのエラー（とその `cause`）で確認できます。

冒頭の例では、観測済み出自のいずれかが `internal` なら返却を拒否します。その分類の意味や優先順位は katagami が決めるものではありません。

検査は再帰的ではありません。`{ repository }` のような入れ子、`Result` の内部、例外や cause、クロージャー、ストリームが後で流す値は調べません。操作が reject した理由も対象外です。任意の情報漏えいを検出する仕組みや、JavaScript のセキュリティーサンドボックスではありません。

## 公開操作の取得と実行

```ts
import { createContainer, createScope, entrypoint } from 'katagami';

const container = createContainer()
  .registerScoped('repository', () => ({ read: (id: string) => `report:${id}` }))
  .registerScoped('readReport', entrypoint(resolver => {
    const repository = resolver.resolve('repository');
    return (id: string, prefix = '', ...labels: string[]) =>
      `${prefix}${repository.read(id)}${labels.join(',')}`;
  }));

await using operations = createScope(container, { access: 'operations' });
const readReport = operations.get('readReport');
const report: string = await readReport('42', 'Report: ', 'draft');
// @ts-expect-error 非公開の登録は操作として取得できない。公開するなら登録時に entrypoint() で包む
operations.get('repository');
```

`createScope(container, { access: 'operations' })` は常に新しい scope を作り、公開面は `get` と `Symbol.asyncDispose` だけです。通常の resolver 用 scope や disposable scope を元に渡す場合も、新しい子 scope を作ります。取得元と同じ scoped キャッシュ・寿命を持つ view に変更する API ではありません。

`get(name)` は同期で公開トークンを確認し、scope に結び付いた呼び出し関数を返します。**取得時には依存を生成しません。** 生の登録関数や resolver、登録マップも返しません。呼び出し時に、終了状態の確認、公開登録の再確認、通常の解決、操作の実行、返却検査の順に処理します。

`.use()` や追加登録で最後の登録が非公開になれば、以前に取得した関数の呼び出しも拒否します。取得時の認可結果を記憶して、呼び出し時の解決検査を省略することはありません。`beforeResolve` はキャッシュから返す場合も実行します。

`entrypoint` は singleton・transient・scoped と非同期 factory に対応します。クラスの全メソッドを自動公開しません。`this` が必要なメソッドは factory の中で所有インスタンスに `bind` してください。要求状態を使う操作は scoped にします。

同期操作でも呼び出しは常に Promise を返します。固定引数・省略可能引数・rest 引数と結果型は登録から推論します。overload は最後のシグネチャーを使い、全シグネチャーを保持しません。generic 関数も入力と出力の型の対応を保持できません。具体的な引数・結果型を持つ関数で包んで公開してください。

必要な操作関数だけを別のコードへ渡せますが、取得元 scope の寿命を越えては利用できません。通常の resolver 用 `createScope(container)` と、その `resolve` などのメソッドは維持します。`entrypoint` に限る公開制限は操作用 scope の面だけのもので、通常の resolver を渡す経路には適用しません。`beforeReturn` は面ごとの「外」に適用し、通常の resolver 用 scope では最上位の解決が対象です。

## 終了と長時間処理

`await using operations = createScope(container, { access: 'operations' })` で、ブロックを抜けるときに終了を待てます。

終了が始まると新しい呼び出しを reject します。取得済み関数も対象です。終了前に始まった呼び出しは、`await` 後の内部解決と `beforeReturn` を含めて完了まで待ち、成功した場合も失敗した場合も結果が呼び出しの Promise に届いてから scope を破棄します。重複した終了要求は同じ終了処理へ合流します。singleton の所有者は元のコンテナーのままで、操作用 scope の終了では破棄しません。

破棄は、生成できた実体を閉じる責務だけを持ちます。非同期 factory が拒否された登録からは閉じる対象を得られないため、終了は待ってから読み飛ばし、残りの実体の破棄を続け、`AggregateError` に含めません。生成の失敗は、その token を解決した呼び出し側（`resolve` の戻り値、操作が返す Promise）が受け取ります。これにより、業務や認可の失敗と、本当に破棄できなかった資源を、それぞれの Promise で一度だけ報告できます。受け取らずに捨てた失敗は、処理系の未処理 rejection としてそのまま現れます。

操作の Promise がストリームや async iterator を返した場合、その値が返った時点で呼び出しは完了します。ストリームの消費・完了・中断を自動追跡しません。消費や後処理が scoped な資源を必要とする場合は、その完了まで `await using` のブロックを維持してください。通知、ジョブの記録、リース解放なども必要な寿命の内側で完了させます。

認可状態が変わる場合は、実行中の scope の状態を書き換えず、新しい固定状態を持つ操作用 scope へ切り替えてください。古い scope の終了を開始して新規呼び出しを止め、開始済み処理と終了を待ちます。取得済み関数は古い scope に属し、新しい scope へ自動で付け替わりません。

## 解決フックの範囲

```ts
import { createContainer, createMetadataKey, createScope, entrypoint } from 'katagami';
import type { ContainerPolicy, OperationsScopeOptions } from 'katagami';

const AREA = createMetadataKey<'reports' | 'settings'>()('area');
const policy = {
  name: 'application',
  requiredMetadata: [AREA] as const,
} satisfies ContainerPolicy;
const container = createContainer({ policy })
  .registerScoped('countReports', entrypoint(() => () => 3), {
    metadata: [AREA('reports')],
  });

const allowedAreas = new Set(['reports']);
const options = {
  access: 'operations',
  beforeResolve(event) {
    if (!allowedAreas.has(event.metadata.require(AREA))) {
      throw new Error('利用できない依存です');
    }
  },
} satisfies OperationsScopeOptions;
await using operations = createScope(container, options);
const count = await operations.get('countReports')();
```

オプションを変数にする場合は `satisfies OperationsScopeOptions` を使うと、`access` の型を `'operations'` に保ち、フックの引数にも型が付きます。`access` が `string` に広がったオブジェクトや、書き間違えた `access` は `createScope` に渡せません。型を外して渡した場合も、実行時に未指定と `'operations'` 以外の `access` を `ContainerError` で拒否し、通常の scope として作ることはありません。

この例の `allowedAreas` は、利用側が事前に認可を確定し、scope の寿命中は変更しない状態です。katagami が業務上の認可を決めるものではありません。

`beforeResolve` は同期関数です。拒否する場合は例外を投げ、許可する場合は何も返しません。非同期フックは拒否します。通常の resolver 用 scope でも利用できます。

対象は `resolve`、`resolveAll`、`tryResolve`、`tryResolveAll` の登録済み依存で、キャッシュ返却前にも実行します。未知のトークンに対する optional 解決は従来どおり `undefined` です。子 scope は親の方針を継承し、追加フックで親の検査を外せません。

event は `token`、`lifetime`、`metadata`、`entrypoint`、`requester`、`path` を持ちます。factory の resolver は所属 scope と呼び出し元を保持し、`await` 後も変わりません。キャッシュ済み実体が保持する依存や、解決済み `lazy` のメソッド実行には新しい解決が発生しないため、過去の依存グラフを毎回検査するものではありません。

### singleton と方針の所有

singleton の factory が resolver をクロージャーに保持すると、その resolver は生成元 scope に所属し続けます。別の scope から singleton を取得して呼び出しても、後続の `resolve` は生成元 scope のフックを使います。生成元を終了すればその resolver は使えません。呼び出す側の scope へ再束縛しません。

singleton の factory が保持した resolver から、後のコールバックや `await` 後に scoped な依存を取得しても captive dependency として拒否します。要求に依存するコールバックを scoped にするか、生成時に適切な寿命の依存を注入してください。要求に依存しない共有基盤だけを singleton にします。

## 型情報を維持する

登録チェーンと `.use()` の戻り値を推論させてください。`RegisteredTokens<typeof container>` は登録チェーンで追跡した実登録のトークン型を取得できます。事前宣言した型マップから作ったコンテナーは、属性か `entrypoint` を持つ最初の登録から後だけを追跡します。それより前の登録は含まれず、そうした登録が無ければ `never` になります。事前宣言サービス型は、登録済みである証明にはなりません。

既存の `Container<T>` 注釈へ代入すると、従来の resolver 用の型は保たれますが登録履歴は消去されます。消去した履歴を必須属性や公開操作の根拠には使いません。その後に明示的に追加した公開操作は推論されます。`.use()` の必須属性保証を必要とする場合は `createContainer({ policy })` の推論を維持してください。

事前宣言サービス型と方針を併用する場合は、TypeScript の部分的な型引数推論の制約があるため、次のように型引数を指定します。必須キーを型引数で列挙し直す必要はありません。

```ts
import { createContainer, createMetadataKey } from 'katagami';
import type { ContainerPolicy } from 'katagami';

const AREA = createMetadataKey<string>()('area');
const policy = {
  name: 'clock',
  requiredMetadata: [AREA] as const,
} satisfies ContainerPolicy;
interface Dependencies { clock: () => number }
const container = createContainer<Dependencies, Record<never, never>, typeof policy>({ policy })
  .registerSingleton('clock', () => Date.now, { metadata: [AREA('core')] })
  .registerScoped('now', resolver => resolver.resolve('clock')(), {
    metadata: [AREA('core')],
  });
```

mutable alias による任意の変更、値が広く宣言された配列、型アサーションまで型で完全に証明することはできません。実行時検査を併用し、登録を組み終えてから scope を作ってください。
