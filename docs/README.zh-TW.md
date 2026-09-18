[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**適用於 TypeScript 的型別安全依賴注入（DI）容器。**

即使程式碼由 AI 程式設計代理撰寫，也能明確描述依賴關係並進行型別檢查。Katagami 隨註冊逐步累積型別，檢查工廠可存取的依賴，並追蹤非同步回傳值。不需要裝飾器、reflect-metadata 或執行階段依賴套件。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## 快速開始

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## 為什麼選擇 Katagami：函式庫比較

Katagami 在一般 TypeScript 工廠中結合了**從註冊推導型別、編譯時作用域限制、零執行期依賴**。不需要裝飾器或中繼資料設定，資源清理與延遲解析可透過獨立入口按需匯入。

**查核日期：2026-09-11。** 對照 npm 穩定版與官方資料；Katagami 一欄描述本次發布（4.0.0）；請參閱[版本與來源](./choosing-di.md#comparison-sources)及[包含非同步與清理功能的完整比較](../README.md#library-comparison)。

| 函式庫／版本 | 依賴型別與註冊檢查 | 作用域策略 |
| --- | --- | --- |
| **Katagami 4.0.0** | **累積字面值、unique symbol 的註冊型別，拒絕未註冊的必要 token** | **從 Singleton、Transient 工廠的 resolver 型別中排除 Scoped token** |
| InversifyJS 8.2.3 | 具型別的 binding；執行時檢查是否已綁定 | binding 的生命週期設定 |
| tsyringe 4.10.0 | 類別與泛型型別；執行時檢查註冊 | 生命週期設定與子容器 |
| TypeDI 0.10.0 | 類別與 `Token<T>`；執行時檢查註冊 | 共用、Transient 服務與具名容器 |
| Awilix 13.0.5 | 從註冊推導 cradle；寬泛的 `resolve` 仍接受未知名稱 | `strict: true` 在執行時檢查生命週期洩漏 |
| NestJS 12.0.1 | 具型別的 provider；執行時解析依賴圖 | Request 作用域向依賴方傳播 |
| Effect 3.22.2 | 透過 `Effect`、`Layer` 型別追蹤所需服務 | 具型別的 `Scope` 與 finalizer |
| typed-inject 5.0.0 | 累積字串 token，檢查 `inject` 元組 | Singleton、Transient 與子 injector |

Awilix、Effect、typed-inject 也有編譯時檢查能力。Katagami 的特色是透過直接呼叫 `r.resolve(token)` 的 API 結合註冊檢查與作用域限制。[窄 token 型別、類別與可變參照的邊界](./type-safety.md)仍然適用。

## 與 AI 程式設計代理搭配使用

讓代理修改依賴關係，執行 TypeScript 檢查，再根據診斷修正。明確的工廠讓依賴關係直接呈現在一般 TypeScript 程式碼中。

例如，Singleton 工廠存取請求層級的 Scoped 狀態時，會出現型別錯誤。

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

將 handler 改為 registerScoped 即可修正此例。@ts-expect-error 用於在 CI 中驗證失敗範例。在應用程式中應修正生命週期，而非抑制錯誤，再執行 npx tsc --noEmit。

## 型別累積與保證範圍

預設的 createContainer() 從註冊中累積型別。保留字面值鍵或 unique symbol 型別時，目前可見註冊集合以外的權杖會被拒絕，不需要手寫服務型別映射。

類別權杖遵循結構型別規則，因此可能接受結構相同的另一個類別。透過 createContainer<Services>() 預先宣告的鍵，即使沒有實際註冊，也會出現在型別中。

支援 Singleton、Transient、Scoped 生命週期、use() 模組組合、非同步工廠、可選及多重解析、資源清理與延遲解析。依賴較少時，一般函式或建構子參數可能已經足夠。

## 指南與可執行範例

- [AI 程式設計指南（英文）](./ai-coding-agents.md)
- [型別保證範圍（英文）](./type-safety.md)
- [API 與使用指南（英文）](./guide.md)
- [註冊策略與公開操作（英文）](./registration-policies.md)
- [請求範圍入門範例（英文）](../examples/request-scope/README.md)
- [DI 選型指南（英文）](./choosing-di.md)

型別範例與執行測試由 CI 驗證。尚未測量 AI 修正成功率或 token 節省效果。

名稱來自日本傳統染色使用的「型紙」。如同疊加型紙，型別也隨註冊逐步累積。

MIT
