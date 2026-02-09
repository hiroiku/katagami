[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

완전한 타입 추론을 지원하는 경량 TypeScript DI 컨테이너.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> 이름은 일본어 型紙 *(katagami)*에서 유래합니다 — 전통 일본 염색에서 정밀한 문양을 직물에 옮기는 데 사용되는 정교한 형지입니다. 여러 형지를 겹쳐 복잡한 무늬를 구성하듯, 메서드 체인의 각 호출마다 타입이 축적됩니다. 형지는 종이와 붓만 있으면 되고, 정교한 기계 장치가 필요 없습니다 — 마찬가지로 Katagami는 데코레이터나 메타데이터 메커니즘 없이 어떤 빌드 도구에서든 바로 사용할 수 있습니다. 그리고 다양한 직물과 기법에 적용되는 형지처럼, Katagami는 TypeScript와 JavaScript, 클래스 토큰과 PropertyKey 토큰에 걸쳐 — 엄격하고 조합 가능한 DI를 위한 하이브리드 접근 방식을 제공합니다.

## 특징

| 특징                 | 설명                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| 완전한 타입 추론     | 메서드 체이닝으로 타입이 축적되며, 미등록 토큰 해석은 컴파일 타임 오류 발생        |
| 세 가지 라이프타임   | Singleton, Transient, Scoped (자식 컨테이너 지원)                                  |
| 비동기 팩토리        | Promise를 반환하는 팩토리는 타입 시스템이 자동 추적                                |
| 순환 의존성 감지     | 전체 순환 경로를 포함하는 명확한 오류 메시지                                       |
| Disposable 지원      | TC39 명시적 리소스 관리 (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`) |
| 캡티브 의존성 방지   | Singleton/Transient 팩토리는 Scoped 토큰에 접근 불가; 컴파일 타임에 감지           |
| 하이브리드 토큰 전략 | 클래스 토큰으로 엄격한 타입 안전성, PropertyKey 토큰으로 유연성                    |
| 인터페이스 타입 맵   | `createContainer<T>()`에 인터페이스를 전달하여 등록 순서 무관한 등록               |
| 제로 의존성          | 데코레이터 불필요, reflect-metadata 불필요, 폴리필 불필요                          |

## 설치

```bash
npm install katagami
```

## 빠른 시작

```ts
import { createContainer } from 'katagami';

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

class UserService {
	constructor(private logger: Logger) {}
	greet(name: string) {
		this.logger.log(`Hello, ${name}`);
	}
}

const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(UserService, r => new UserService(r.resolve(Logger)));

const userService = container.resolve(UserService);
//    ^? UserService (완전히 추론됨)
userService.greet('world');
```

## 왜 Katagami인가

대부분의 TypeScript DI 컨테이너는 데코레이터, reflect-metadata 또는 문자열 기반 토큰에 의존하며 — 각각 도구 호환성, 타입 안전성 또는 번들 크기에서 트레이드오프를 수반합니다. Katagami는 다른 접근 방식을 취합니다.

### 데코레이터 불필요, reflect-metadata 불필요

데코레이터 기반 DI는 `experimentalDecorators` 및 `emitDecoratorMetadata` 컴파일러 옵션이 필요합니다. esbuild와 Vite(기본 설정) 같은 최신 빌드 도구는 `emitDecoratorMetadata`를 지원하지 않으며, TC39 표준 데코레이터 제안에도 자동 타입 메타데이터 생성에 해당하는 기능이 포함되어 있지 않습니다. Katagami는 이 중 어느 것에도 의존하지 않으므로 — 어떤 빌드 도구에서든 바로 사용할 수 있습니다.

### 클래스 토큰을 통한 완전한 타입 추론

문자열 토큰 DI는 토큰에서 타입으로의 수동 매핑을 유지해야 합니다. 매개변수 이름 매칭은 코드 압축 시 깨집니다. Katagami는 클래스를 직접 토큰으로 사용하므로, `resolve`가 올바른 반환 타입을 — 동기 또는 `Promise` — 추가 어노테이션 없이 자동으로 추론합니다.

### 메서드 체인 타입 축적

각 `register` 호출마다 타입이 축적됩니다. 팩토리 내부에서 리졸버는 체인의 해당 시점까지 등록된 토큰만 받아들입니다. 미등록 토큰을 해석하면 런타임 오류가 아닌 컴파일 타임 오류가 발생합니다.

### 하이브리드 토큰 전략

클래스 토큰은 메서드 체이닝을 통해 엄격한 순서 의존적 타입 안전성을 제공합니다. 하지만 때로는 서비스 세트를 미리 정의하고 임의의 순서로 등록하고 싶을 수 있습니다. `createContainer<T>()`에 인터페이스를 전달하고 PropertyKey 토큰을 사용하세요 — 타입 맵은 생성 시점에 고정되므로 등록 순서는 중요하지 않습니다.

### 제로 의존성

런타임 의존성 없음, 폴리필 없음. reflect-metadata(비압축 약 50 KB)를 번들에 추가할 필요가 없습니다.

## 가이드

### Singleton과 Transient

Singleton은 첫 번째 `resolve`에서 인스턴스를 생성하고 캐시합니다. Transient는 매번 새로운 인스턴스를 생성합니다.

```ts
import { createContainer } from 'katagami';

class Database {
	constructor(public id = Math.random()) {}
}

class RequestHandler {
	constructor(public id = Math.random()) {}
}

const container = createContainer()
	.registerSingleton(Database, () => new Database())
	.registerTransient(RequestHandler, () => new RequestHandler());

// Singleton — 매번 같은 인스턴스
container.resolve(Database) === container.resolve(Database); // true

// Transient — 매번 새로운 인스턴스
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Scoped 라이프타임과 자식 컨테이너

Scoped 등록은 스코프 내에서는 Singleton처럼 동작하지만 각 새로운 스코프에서 새 인스턴스를 생성합니다. `createScope()`를 사용하여 자식 컨테이너를 생성합니다. Scoped 토큰은 루트 컨테이너에서 해석할 수 없습니다.

```ts
import { createContainer } from 'katagami';

class DbPool {
	constructor(public name = 'main') {}
}

class RequestContext {
	constructor(public id = Math.random()) {}
}

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, () => new RequestContext());

// 각 요청마다 스코프 생성
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — 같은 스코프 내에서는 동일, 스코프 간에는 다름
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — 모든 스코프에서 공유
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

스코프는 중첩할 수도 있습니다. 각 중첩 스코프는 자체 Scoped 인스턴스 캐시를 가지면서 부모와 Singleton을 공유합니다:

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// 각 중첩 스코프는 독립적인 Scoped 인스턴스를 가짐
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singleton은 여전히 공유됨
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### 비동기 팩토리

`Promise`를 반환하는 팩토리는 타입 시스템이 자동으로 추적합니다. 비동기 토큰을 `resolve`하면 반환 타입은 `V`가 아닌 `Promise<V>`입니다:

```ts
import { createContainer } from 'katagami';

class Database {
	constructor(public connected: boolean) {}
}

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async () => {
		await new Promise(r => setTimeout(r, 100)); // 비동기 초기화 시뮬레이션
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>  (await 후 → Database)
db.connected; // true
```

비동기 팩토리는 동기 및 비동기 등록 모두에 의존할 수 있습니다:

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // 동기 → Logger
		logger.log('연결 중...');
		return new Database(true);
	});
```

### 순환 의존성 감지

Katagami는 현재 해석 중인 토큰을 추적합니다. 순환 의존성이 발견되면 전체 순환 경로를 포함하는 `ContainerError`가 발생합니다:

```ts
import { createContainer } from 'katagami';

class ServiceA {
	constructor(public b: ServiceB) {}
}

class ServiceB {
	constructor(public a: ServiceA) {}
}

const container = createContainer()
	.registerSingleton(ServiceA, r => new ServiceA(r.resolve(ServiceB)))
	.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

container.resolve(ServiceA);
// ContainerError: Circular dependency detected: ServiceA -> ServiceB -> ServiceA
```

간접적인 순환도 감지됩니다:

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Disposable 지원

`Container`와 `Scope` 모두 `AsyncDisposable`을 구현합니다. 폐기 시 관리 대상 인스턴스가 생성 역순(LIFO)으로 순회되며, `[Symbol.asyncDispose]()` 또는 `[Symbol.dispose]()` 메서드가 자동으로 호출됩니다.

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// 수동 폐기
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

`await using`을 사용하면 블록 끝에서 스코프가 자동으로 폐기됩니다:

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... conn 사용 ...
} // 여기서 스코프가 폐기됨 — Connection이 정리되고, DbPool은 영향 없음
```

스코프 폐기는 Scoped 인스턴스에만 영향을 줍니다. Singleton 인스턴스는 루트 컨테이너가 소유하며, 컨테이너 자체가 폐기될 때 폐기됩니다.

### 인터페이스 타입 맵

`createContainer<T>()`에 인터페이스를 전달하면 PropertyKey 토큰의 타입이 체이닝 축적이 아닌 인터페이스에서 결정됩니다. 따라서 토큰을 임의의 순서로 등록하고 해석할 수 있습니다:

```ts
import { createContainer } from 'katagami';

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

interface Services {
	logger: Logger;
	greeting: string;
}

const container = createContainer<Services>()
	// 'greeting'은 'logger'보다 먼저 등록되어도 참조 가능
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('greeting 구성 중...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### 하이브리드 토큰 전략

두 가지 접근 방식을 혼합할 수 있습니다 — 클래스 토큰으로 순서 의존적 타입 안전성을, PropertyKey 토큰으로 순서 무관한 유연성을 활용하세요:

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('greeting 구성 중...');
		return 'Hello!';
	});
```

### 캡티브 의존성 방지

"캡티브 의존성"은 긴 라이프타임의 서비스(Singleton 또는 Transient)가 짧은 라이프타임의 서비스(Scoped)를 캡처하여 의도한 스코프를 넘어 유지시키는 문제입니다. Katagami는 이를 컴파일 타임에 방지합니다 — Singleton과 Transient 팩토리는 비 Scoped 토큰으로 제한된 리졸버만 받습니다:

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — Singleton 팩토리는 Scoped 토큰을 해석할 수 없음
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

반면 Scoped 팩토리는 Scoped 토큰과 비 Scoped 토큰 모두를 해석할 수 있습니다:

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — Scoped 팩토리는 Singleton 토큰을 해석할 수 있음
		return new RequestContext();
	});
```

## API

### `createContainer<T, ScopedT>()`

새로운 DI 컨테이너를 생성합니다. PropertyKey 토큰의 타입 맵을 정의하려면 인터페이스를 `T`로 전달합니다. Scoped PropertyKey 토큰의 별도 타입 맵을 정의하려면 `ScopedT`를 전달합니다(`T`와 마찬가지로 등록 순서 무관).

### `container.registerSingleton(token, factory)`

팩토리를 Singleton으로 등록합니다. 인스턴스는 첫 번째 `resolve`에서 생성되고 이후 캐시됩니다. 메서드 체이닝을 위해 컨테이너를 반환합니다.

### `container.registerTransient(token, factory)`

팩토리를 Transient로 등록합니다. 매 `resolve`마다 새로운 인스턴스가 생성됩니다. 메서드 체이닝을 위해 컨테이너를 반환합니다.

### `container.registerScoped(token, factory)`

팩토리를 Scoped로 등록합니다. 스코프 내에서 인스턴스는 첫 번째 `resolve`에서 생성되고 해당 스코프에 캐시됩니다. 각 스코프는 자체 캐시를 유지합니다. Scoped 토큰은 루트 컨테이너에서 해석할 수 없습니다. 메서드 체이닝을 위해 컨테이너를 반환합니다.

### `container.resolve(token)`

주어진 토큰의 인스턴스를 해석하여 반환합니다. 토큰이 미등록이거나 순환 의존성이 감지되면 `ContainerError`를 throw합니다.

### `container.createScope()`

새로운 `Scope`(자식 컨테이너)를 생성합니다. 스코프는 부모의 모든 등록을 상속합니다. Singleton 인스턴스는 부모와 공유되며, Scoped 인스턴스는 스코프 로컬입니다.

### `Scope`

`createScope()`로 생성되는 스코프 자식 컨테이너입니다. `resolve(token)`, `createScope()`(중첩 스코프용), `[Symbol.asyncDispose]()`를 제공합니다.

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

모든 관리 대상 인스턴스를 생성 역순(LIFO)으로 폐기합니다. 각 인스턴스의 `[Symbol.asyncDispose]()` 또는 `[Symbol.dispose]()`를 호출합니다. 멱등 — 이후 호출은 아무 작업도 하지 않습니다. 폐기 후 `resolve()`와 `createScope()`는 `ContainerError`를 throw합니다.

### `ContainerError`

미등록 토큰 해석, 순환 의존성, 폐기된 컨테이너/스코프에 대한 작업 등 컨테이너 실패 시 throw되는 오류 클래스입니다.

### `Resolver`

팩토리 콜백에 전달되는 리졸버를 나타내는 타입 export입니다. 리졸버 매개변수를 받는 함수에 타입을 지정할 때 유용합니다.

## 라이선스

MIT
