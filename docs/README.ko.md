[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**TypeScript를 위한 타입 안전한 의존성 주입(DI) 컨테이너.**

AI 코딩 에이전트가 작성한 코드에서도 의존 관계를 명시하고 타입으로 검사하세요. Katagami는 등록할 때마다 타입을 누적하고, 팩터리에서 접근 가능한 토큰과 비동기 반환값을 추적합니다. 데코레이터, reflect-metadata, 런타임 의존 패키지가 필요하지 않습니다.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## 빠른 시작

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## Katagami를 선택하는 이유와 라이브러리 비교

**등록에서 추론한 타입, 컴파일 시점의 스코프 제한, 런타임 의존성 없음**을 일반 TypeScript 팩터리에서 함께 사용할 수 있습니다. 데코레이터나 메타데이터 설정이 필요 없으며, 리소스 정리와 지연 해석은 별도 진입점으로 가져옵니다.

**2026-09-11 확인.** npm의 안정 버전과 공식 자료를 비교했습니다. [버전과 출처](./choosing-di.md#comparison-sources), [비동기·정리 기능까지 포함한 전체 비교](../README.md#library-comparison)를 참고하세요.

| 라이브러리 / 버전 | 의존성 타입과 등록 확인 | 스코프 정책 |
| --- | --- | --- |
| **Katagami 3.0.2** | **리터럴·unique symbol 등록을 누적하고 미등록 필수 토큰 거부** | **Singleton·Transient 팩터리에서 Scoped 토큰을 타입으로 제외** |
| InversifyJS 8.2.3 | 타입이 있는 binding, 등록 여부는 런타임 확인 | binding의 라이프타임 설정 |
| tsyringe 4.10.0 | 클래스·제네릭 타입, 등록 여부는 런타임 확인 | 라이프타임 설정과 자식 컨테이너 |
| TypeDI 0.10.0 | 클래스·`Token<T>`, 등록 여부는 런타임 확인 | 공유·Transient 서비스와 이름 있는 컨테이너 |
| Awilix 13.0.5 | 등록에서 cradle 추론. 넓은 `resolve`는 미등록 이름도 허용 | `strict: true`로 런타임 라이프타임 검사 |
| NestJS 12.0.1 | 타입이 있는 provider, 런타임 의존성 그래프 | Request 스코프가 의존하는 쪽으로 전파 |
| Effect 3.22.2 | `Effect`·`Layer` 타입으로 필요한 서비스 추적 | 타입이 있는 `Scope`와 finalizer |
| typed-inject 5.0.0 | 문자열 토큰 누적과 `inject` 튜플 검사 | Singleton·Transient, 자식 injector |

Awilix, Effect, typed-inject에도 컴파일 시점 기능이 있습니다. Katagami는 등록 확인과 스코프 제한을 직접 `r.resolve(token)`을 호출하는 API로 결합합니다. [토큰 타입·클래스·변경 가능한 참조의 조건](./type-safety.md)이 적용됩니다.

## AI 코딩 에이전트와 함께 사용하기

에이전트가 의존 관계를 수정하고 TypeScript 검사기를 실행한 뒤 진단에 따라 수정하는 흐름을 만듭니다. 팩터리에 의존 관계가 일반 TypeScript 코드로 드러납니다.

예를 들어 Singleton 팩터리에서 요청별 Scoped 상태를 참조하면 타입 오류가 발생합니다.

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

handler를 registerScoped로 등록하면 이 오류를 해결할 수 있습니다. @ts-expect-error는 실패 예제를 검증하기 위한 것입니다. 앱에서는 오류를 억제하지 말고 수명을 수정한 뒤 npx tsc --noEmit을 실행하세요.

## 누적 타입과 보장 범위

기본 createContainer()는 등록에서 타입을 누적합니다. 리터럴 키와 unique symbol 타입을 유지하면, 현재 보이는 등록 집합에 없는 토큰은 거부됩니다. 별도의 서비스 타입 맵은 필요하지 않습니다.

클래스 토큰은 구조적 타이핑을 따르므로 구조가 같은 다른 클래스가 허용될 수 있습니다. createContainer<Services>()에 미리 선언한 키 역시 실제 등록이 없어도 타입에 나타납니다.

Singleton, Transient, Scoped 수명, use() 모듈 합성, 비동기 팩터리, 선택적·다중 해석, 리소스 정리 및 지연 해석을 지원합니다. 의존성이 적다면 일반 함수나 생성자 매개변수로 충분할 수 있습니다.

## 가이드와 실행 가능한 예제

- [AI 코딩 가이드 (영어)](./ai-coding-agents.md)
- [타입 보장 범위 (영어)](./type-safety.md)
- [API와 사용 가이드 (영어)](./guide.md)
- [요청 스코프 스타터 (영어)](../examples/request-scope/README.md)
- [DI 선택 가이드 (영어)](./choosing-di.md)

타입 예제와 실행 테스트는 CI에서 검사합니다. AI 수정 성공률이나 토큰 절감 효과는 아직 측정하지 않았습니다.

이름은 일본 전통 염색의 형지인 型紙에서 왔습니다. 형지를 겹치듯 등록마다 타입이 누적됩니다.

MIT
