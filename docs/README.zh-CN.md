[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**适用于 TypeScript 的类型安全依赖注入（DI）容器。**

即使代码由 AI 编程智能体编写，也能显式描述依赖关系并进行类型检查。Katagami 随注册逐步累积类型，检查工厂可访问的依赖，并追踪异步返回值。无需装饰器、reflect-metadata 或运行时依赖包。

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## 快速开始

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## 为什么选择 Katagami：库对比

Katagami 在普通 TypeScript 工厂中结合了**从注册推导类型、编译时作用域限制、零运行时依赖**。无需装饰器或元数据配置，资源清理和延迟解析可通过独立入口按需导入。

**核查日期：2026-09-11。** 对照 npm 稳定版和官方资料；Katagami 一栏描述本次发布（4.0.0）；参见[版本与来源](./choosing-di.md#comparison-sources)及[包含异步和清理功能的完整对比](../README.md#library-comparison)。

| 库／版本 | 依赖类型与注册检查 | 作用域策略 |
| --- | --- | --- |
| **Katagami 4.0.0** | **累积字面量、unique symbol 的注册类型，拒绝未注册的必需 token** | **从 Singleton、Transient 工厂的 resolver 类型中排除 Scoped token** |
| InversifyJS 8.2.3 | 有类型的 binding；运行时检查是否已绑定 | binding 的生命周期设置 |
| tsyringe 4.10.0 | 类与泛型类型；运行时检查注册 | 生命周期设置与子容器 |
| TypeDI 0.10.0 | 类与 `Token<T>`；运行时检查注册 | 共享、Transient 服务与命名容器 |
| Awilix 13.0.5 | 从注册推导 cradle；宽泛的 `resolve` 仍接受未知名称 | `strict: true` 在运行时检查生命周期泄漏 |
| NestJS 12.0.1 | 有类型的 provider；运行时解析依赖图 | Request 作用域向依赖方传播 |
| Effect 3.22.2 | 通过 `Effect`、`Layer` 类型追踪所需服务 | 有类型的 `Scope` 与 finalizer |
| typed-inject 5.0.0 | 累积字符串 token，检查 `inject` 元组 | Singleton、Transient 与子 injector |

Awilix、Effect、typed-inject 也有编译时检查能力。Katagami 的特点是通过直接调用 `r.resolve(token)` 的 API 结合注册检查与作用域限制。[窄 token 类型、类和可变引用的边界](./type-safety.md)仍然适用。

## 配合 AI 编程智能体使用

让智能体修改依赖关系，运行 TypeScript 检查，再根据诊断修复。显式工厂让依赖关系直接体现在普通 TypeScript 代码中。

例如，Singleton 工厂访问请求级 Scoped 状态时，会出现类型错误。

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

将 handler 改为 registerScoped 即可修正此例。@ts-expect-error 用于在 CI 中验证失败示例。在应用中应修正生命周期，而非抑制错误，然后运行 npx tsc --noEmit。

## 类型累积与保证范围

默认的 createContainer() 从注册中累积类型。保留字面量键或 unique symbol 类型时，当前可见注册集合之外的令牌会被拒绝，无需手写服务类型映射。

类令牌遵循结构类型规则，因此可能接受结构相同的另一个类。通过 createContainer<Services>() 预先声明的键，即使没有实际注册，也会出现在类型中。

支持 Singleton、Transient、Scoped 生命周期、use() 模块组合、异步工厂、可选及多重解析、资源清理和延迟解析。依赖较少时，普通函数或构造函数参数可能已经足够。

## 指南与可运行示例

- [AI 编程指南（英语）](./ai-coding-agents.md)
- [类型保证范围（英语）](./type-safety.md)
- [API 与使用指南（英语）](./guide.md)
- [注册策略与公开操作（英语）](./registration-policies.md)
- [请求作用域入门示例（英语）](../examples/request-scope/README.md)
- [DI 选型指南（英语）](./choosing-di.md)

类型示例及运行测试由 CI 验证。尚未测量 AI 修复成功率或令牌节省效果。

名称来自日本传统染色中使用的“型纸”。如同叠加型纸，类型也随注册逐步累积。

MIT
