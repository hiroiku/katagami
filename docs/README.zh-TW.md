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
- [請求範圍入門範例（英文）](../examples/request-scope/README.md)
- [DI 選型指南（英文）](./choosing-di.md)

型別範例與執行測試由 CI 驗證。尚未測量 AI 修正成功率或 token 節省效果。

名稱來自日本傳統染色使用的「型紙」。如同疊加型紙，型別也隨註冊逐步累積。

MIT
