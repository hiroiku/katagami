[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

Contenedor DI ligero para TypeScript con inferencia de tipos completa.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> El nombre proviene de 型紙 _(katagami)_ — papel de estarcido de precisión utilizado en el teñido tradicional japonés para transferir patrones exactos sobre la tela. Se superponen múltiples estarcidos para componer diseños intrincados, de la misma manera que los tipos se acumulan con cada llamada en la cadena de métodos. Cada estarcido es una pieza independiente — se elige solo el necesario para el trabajo actual, el resto se deja aparte — del mismo modo que los exports por subruta aseguran que solo el código que usas entre en tu paquete. El patrón recortado determina exactamente por dónde pasa el tinte y dónde se bloquea, tal como el sistema de tipos de Katagami detecta errores en tiempo de compilación, no en tiempo de ejecución. Y un estarcido solo necesita papel y un pincel, sin maquinaria elaborada — del mismo modo, Katagami no requiere decoradores ni mecanismos de metadatos y funciona con cualquier herramienta de construcción sin configuración adicional.

## Características

| Característica                       | Descripción                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cero dependencias                    | Sin decoradores, sin reflect-metadata, sin polyfills — funciona con cualquier bundler sin configuración                                   |
| Inferencia de tipos completa         | Los tipos se acumulan mediante encadenamiento de métodos; los tokens no registrados generan errores en tiempo de compilación              |
| Tree-shakeable                       | Exports por subruta (`katagami/scope`, `katagami/disposable`) y `sideEffects: false` para un tamaño de paquete mínimo                     |
| Prevención de dependencias cautivas  | Las fábricas Singleton/Transient no pueden acceder a tokens Scoped; detectado en tiempo de compilación y en tiempo de ejecución en scopes |
| Estrategia de tokens híbrida         | Tokens de clase para seguridad de tipos estricta, tokens PropertyKey para flexibilidad                                                    |
| Mapa de tipos con interfaz           | Pasa una interfaz a `createContainer<T>()` para registro independiente del orden                                                          |
| Tres ciclos de vida                  | Singleton, Transient y Scoped con contenedores hijos                                                                                      |
| Soporte Disposable                   | TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`)                                              |
| Composición de módulos               | Los contenedores se pueden componer con `use()` para agrupar y reutilizar registros                                                       |
| Fábricas asíncronas                  | Las fábricas que retornan Promise son rastreadas automáticamente por el sistema de tipos                                                  |
| Detección de dependencias circulares | Mensajes de error claros con la ruta completa del ciclo                                                                                   |
| Resolución opcional                  | `tryResolve` devuelve `undefined` para tokens no registrados en lugar de lanzar                                                           |
| Resolución diferida                  | Instanciación diferida basada en Proxy mediante `lazy()` de `katagami/lazy`; instancia creada en el primer acceso                         |

## Instalación

```bash
npm install katagami
```

## Inicio rápido

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
//    ^? UserService (inferencia completa)
userService.greet('world');
```

## Por qué Katagami

La mayoría de los contenedores DI de TypeScript dependen de decoradores, reflect-metadata o tokens basados en cadenas de texto — cada uno con compromisos en compatibilidad de herramientas, seguridad de tipos o tamaño del paquete. Katagami adopta un enfoque diferente.

> **Nota:** Esta comparación se investigó el 2026-02-09. Las características pueden haber cambiado desde entonces.

| Aspect                            | Katagami                                                         | InversifyJS                      | tsyringe                                        | TypeDI                                  | Awilix                              | NestJS                                | Effect                            | typed-inject                   |
| --------------------------------- | ---------------------------------------------------------------- | -------------------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------------- | --------------------------------- | ------------------------------ |
| **Runtime requirements**          | ✅ None                                                          | ❌ reflect-metadata, decorators  | ❌ reflect-metadata, decorators                 | ❌ reflect-metadata, decorators         | ✅ None                             | ❌ reflect-metadata, decorators       | ✅ None                           | ✅ None                        |
| **Lifetimes**                     | ✅ Singleton, Transient, Scoped                                  | ✅ Singleton, Transient, Request | ✅ Singleton, Transient, Resolution / Container | Singleton, Transient (named containers) | ✅ Singleton, Transient, Scoped     | ✅ Singleton, Transient, Request      | Shared (memoized), Scoped         | ❌ Singleton, Transient        |
| **Injection style**               | Constructor (explicit factory)                                   | Constructor, Property            | Constructor                                     | Constructor, Property                   | Constructor (proxy / classic)       | Constructor                           | Functional (Tag + Layer)          | Constructor (static inject)    |
| **Token types**                   | Class, PropertyKey, Interface map                                | Class, String, Symbol            | Class, String, Symbol                           | Class, String, Token\<T\>               | String                              | Class, String, Symbol, InjectionToken | Context.Tag                       | String literal                 |
| **Type safety**                   | ✅ Compile-time; full inference, captive-dep guard (+ runtime)   | ❌ Generic binding types         | ❌ Generic types                                | ❌ Generic types, Token\<T\>            | ❌ Cradle interface typing          | ❌ Generic types                      | ✅ Compile-time; R type parameter | ✅ Compile-time; static inject |
| **Resource cleanup**              | ✅ TC39 Symbol.dispose / asyncDispose; await using               | Deactivation handlers            | container.dispose()                             | Container.reset()                       | Disposer functions                  | Lifecycle hooks (onModuleDestroy)     | Scope finalizers; acquireRelease  | injector.dispose()             |
| **Tree-shaking**                  | ✅ Subpath exports; sideEffects: false                           | ❌                               | ❌                                              | ❌                                      | ✅ No decorator / metadata overhead | ❌                                    | ✅ Subpath exports; ESM           | ✅ Zero deps; small bundle     |
| **Async factories**               | ✅                                                               | ✅                               | ❌                                              | ❌                                      | ❌                                  | ✅                                    | ✅                                | ❌                             |
| **Optional resolution**           | ✅                                                               | ✅                               | ✅                                              | ✅                                      | ✅                                  | ✅                                    | ✅                                | ❌                             |
| **Multi-binding**                 | ✅                                                               | ✅                               | ✅                                              | ✅                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |
| **Lazy resolution**               | ✅                                                               | ✅                               | ✅                                              | ❌                                      | ✅                                  | ✅ LazyModuleLoader                   | ✅ Lazy by design                 | ❌                             |
| **Conditional bindings**          | ✅ Token separation + factory logic + scopes                     | ✅ Named, tagged, contextual     | ❌                                              | ❌                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |
| **Auto-loading**                  | ✅ use() module composition (explicit, decorator-free by design) | ✅                               | ❌                                              | ❌                                      | ✅                                  | ❌                                    | ❌                                | ❌                             |
| **Child containers**              | ✅                                                               | ✅                               | ✅                                              | ✅                                      | ✅                                  | ✅                                    | ✅                                | ✅                             |
| **Module system**                 | ✅                                                               | ✅                               | ❌                                              | ❌                                      | ✅                                  | ✅                                    | ✅                                | ❌                             |
| **Circular dependency detection** | ✅                                                               | ✅                               | ✅                                              | ❌                                      | ✅                                  | ✅                                    | ✅                                | ❌                             |
| **Middleware / Interceptors**     | ✅ Higher-order factory wrappers                                 | ✅                               | ✅                                              | ❌                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |
| **Snapshot / Restore**            | ✅ Immutable containers; use() for test isolation                | ✅                               | ❌                                              | ❌                                      | ❌                                  | ❌                                    | ❌                                | ❌                             |

### Sin decoradores, sin reflect-metadata

La DI basada en decoradores requiere las opciones del compilador `experimentalDecorators` y `emitDecoratorMetadata`. Las herramientas de construcción modernas como esbuild y Vite (configuración por defecto) no soportan `emitDecoratorMetadata`, y la propuesta de decoradores estándar TC39 no incluye un equivalente para la emisión automática de metadatos de tipos. Katagami no depende de nada de esto — funciona con cualquier herramienta de construcción sin configuración adicional.

### Tree-shakeable

Katagami se divide en exports por subruta. Importa solo lo que necesitas — `katagami/scope`, `katagami/disposable` y `katagami/lazy` se eliminan completamente del paquete si no se importan. Combinado con `sideEffects: false`, los bundlers pueden eliminar cada byte no utilizado.

```ts
// Solo el núcleo — scope, disposable y lazy no se incluyen en el paquete
import { createContainer } from 'katagami';

// Importa solo lo que necesitas
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

### Inferencia de tipos completa desde tokens de clase

La DI con tokens de cadena te obliga a mantener mapeos manuales de token a tipo. La coincidencia por nombre de parámetro se rompe con la minificación. Katagami usa clases directamente como tokens, así que `resolve` infiere automáticamente el tipo de retorno correcto — síncrono o `Promise` — sin anotaciones adicionales.

### Acumulación de tipos en cadena de métodos

Los tipos se acumulan con cada llamada a `register`. Dentro de una fábrica, el resolver solo acepta tokens que ya han sido registrados en ese punto de la cadena. Resolver un token no registrado es un error de compilación, no una sorpresa en tiempo de ejecución.

### Estrategia de tokens híbrida

Los tokens de clase te dan seguridad de tipos estricta y dependiente del orden a través del encadenamiento de métodos. Pero a veces quieres definir un conjunto de servicios por adelantado y registrarlos en cualquier orden. Pasa una interfaz a `createContainer<T>()` y usa tokens PropertyKey — el mapa de tipos se fija en el momento de la creación, así que el orden de registro no importa.

### Cero dependencias

Sin dependencias en tiempo de ejecución, sin polyfills. No necesitas añadir reflect-metadata (~50 KB sin minificar) a tu paquete.

## Guía

### Singleton y Transient

Singleton crea la instancia en el primer `resolve` y la almacena en caché. Transient crea una nueva instancia cada vez.

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

// Singleton — siempre la misma instancia
container.resolve(Database) === container.resolve(Database); // true

// Transient — nueva instancia cada vez
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Ciclo de vida Scoped y contenedores hijos

Los registros Scoped se comportan como singletons dentro de un scope pero producen una instancia nueva en cada nuevo scope. Importa `createScope` desde `katagami/scope` para crear un contenedor hijo. Los tokens Scoped no pueden resolverse desde el contenedor raíz.

```ts
import { createContainer } from 'katagami';
import { createScope } from 'katagami/scope';

class DbPool {
	constructor(public name = 'main') {}
}

class RequestContext {
	constructor(public id = Math.random()) {}
}

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, () => new RequestContext());

// Crear un scope para cada petición
const scope1 = createScope(root);
const scope2 = createScope(root);

// Scoped — mismo dentro de un scope, diferente entre scopes
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — compartido entre todos los scopes
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

Los scopes también pueden anidarse. Cada scope anidado tiene su propia caché de instancias Scoped mientras comparte singletons con su padre:

```ts
const parentScope = createScope(root);
const childScope = createScope(parentScope);

// Cada scope anidado obtiene sus propias instancias Scoped
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Los singletons siguen siendo compartidos
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### Fábricas asíncronas

Las fábricas que retornan `Promise` son rastreadas automáticamente por el sistema de tipos. Cuando resuelves un token asíncrono, el tipo de retorno es `Promise<V>` en lugar de `V`:

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
		await new Promise(r => setTimeout(r, 100)); // simular inicialización asíncrona
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>  (con await → Database)
db.connected; // true
```

Las fábricas asíncronas pueden depender tanto de registros síncronos como asíncronos:

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // síncrono → Logger
		logger.log('Conectando...');
		return new Database(true);
	});
```

### Detección de dependencias circulares

Katagami rastrea qué tokens se están resolviendo actualmente. Si se encuentra una dependencia circular, se lanza un `ContainerError` con un mensaje claro que muestra la ruta completa del ciclo:

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

Los ciclos indirectos también son detectados:

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Soporte Disposable

La eliminación es proporcionada por el wrapper `disposable()` de `katagami/disposable`. Envolver un contenedor o scope le adjunta `[Symbol.asyncDispose]`, habilitando la sintaxis `await using`. Cuando se elimina, las instancias gestionadas se recorren en orden inverso de creación (LIFO) y sus métodos `[Symbol.asyncDispose]()` o `[Symbol.dispose]()` se llaman automáticamente.

```ts
import { createContainer } from 'katagami';
import { disposable } from 'katagami/disposable';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// Eliminación manual
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

Con `await using`, los scopes se eliminan automáticamente al final del bloque:

```ts
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = disposable(createScope(root));
	const conn = scope.resolve(Connection);
	// ... usar conn ...
} // el scope se elimina aquí — Connection se limpia, DbPool no
```

La eliminación del scope solo afecta a las instancias Scoped. Las instancias Singleton son propiedad del contenedor raíz y se eliminan cuando el propio contenedor es eliminado.

El envoltorio `disposable()` también reduce el tipo de retorno, eliminando los métodos de registro (`registerSingleton`, `registerTransient`, `registerScoped`, `use`) a nivel de tipos. Esto previene registros accidentales en un contenedor que podría estar eliminado:

```ts
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection); // OK
container.registerSingleton(/* ... */); // Error en tiempo de compilación
```

### Resolución diferida (Lazy Resolution)

La función `lazy()` de `katagami/lazy` crea un proxy que difiere la creación de instancias hasta el primer acceso a una propiedad. Es útil para optimizar el tiempo de arranque o resolver dependencias circulares.

```ts
import { createContainer } from 'katagami';
import { lazy } from 'katagami/lazy';

class HeavyService {
	constructor() {
		// inicialización costosa
	}
	process() {
		return 'done';
	}
}

const container = createContainer().registerSingleton(HeavyService, () => new HeavyService());

const service = lazy(container, HeavyService);
// HeavyService NO está instanciado aún

service.process(); // instancia creada aquí, luego en caché
service.process(); // usa la instancia en caché
```

El proxy reenvía de forma transparente todos los accesos a propiedades, llamadas a métodos, comprobaciones `in` y consultas de prototipo a la instancia real. Los métodos se vinculan automáticamente a la instancia real, por lo que `this` funciona correctamente incluso al desestructurar.

Solo se admiten **tokens de clase síncronos**. Los tokens asíncronos y los tokens PropertyKey se rechazan a nivel de tipos porque los traps de Proxy son síncronos.

`lazy()` funciona con Container, Scope, DisposableContainer y DisposableScope:

```ts
import { createScope } from 'katagami/scope';

const root = createContainer().registerScoped(RequestContext, () => new RequestContext());
const scope = createScope(root);

const ctx = lazy(scope, RequestContext); // resolución scoped diferida
```

### Tree Shaking

Katagami utiliza exports por subruta para dividir la funcionalidad en puntos de entrada independientes. Si solo necesitas el contenedor principal, `katagami/scope`, `katagami/disposable` y `katagami/lazy` se excluyen completamente del paquete. El paquete declara `sideEffects: false`, por lo que los bundlers pueden eliminar de forma segura cualquier código no utilizado.

```ts
// Solo el núcleo — scope, disposable y lazy no se incluyen en el paquete
import { createContainer } from 'katagami';

// Importa solo lo que necesitas
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

### Mapa de tipos con interfaz

Cuando pasas una interfaz a `createContainer<T>()`, los tokens PropertyKey obtienen sus tipos de la interfaz en lugar de acumularlos mediante encadenamiento. Esto significa que puedes registrar y resolver tokens en cualquier orden:

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
	// 'greeting' puede referenciar 'logger' aunque se registre después
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('Construyendo greeting...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### Estrategia de tokens híbrida

Puedes mezclar ambos enfoques — usa tokens de clase para seguridad de tipos dependiente del orden y tokens PropertyKey para flexibilidad independiente del orden:

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('Construyendo greeting...');
		return 'Hello!';
	});
```

### Prevención de dependencias cautivas

Una "dependencia cautiva" ocurre cuando un servicio de larga vida (singleton o transient) captura un servicio de corta vida (scoped), manteniéndolo vivo más allá de su scope previsto. Katagami previene esto en tiempo de compilación — las fábricas singleton y transient solo reciben un resolver limitado a tokens no Scoped:

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — la fábrica singleton no puede resolver tokens Scoped
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

Las fábricas Scoped, por otro lado, pueden resolver tanto tokens Scoped como no Scoped:

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — la fábrica Scoped puede resolver tokens Singleton
		return new RequestContext();
	});
```

Katagami también aplica esta regla en tiempo de ejecución dentro de los scopes. Si una fábrica singleton intenta resolver un token Scoped — directa o indirectamente — se lanza un `ContainerError`:

```ts
import { createContainer } from 'katagami';
import { createScope } from 'katagami/scope';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));

const scope = createScope(container);
scope.resolve(DbPool);
// ContainerError: Captive dependency detected: scoped token "RequestContext" cannot be resolved inside a singleton factory.
```

## API

### `createContainer<T, ScopedT>()`

Crea un nuevo contenedor DI. Pasa una interfaz como `T` para definir el mapa de tipos para tokens PropertyKey. Pasa `ScopedT` para definir un mapa de tipos separado para tokens PropertyKey Scoped (independiente del orden, igual que `T`).

### `Container.prototype.registerSingleton(token, factory)`

Registra una fábrica como singleton. La instancia se crea en el primer `resolve` y se almacena en caché. Retorna el contenedor para encadenamiento de métodos.

### `Container.prototype.registerTransient(token, factory)`

Registra una fábrica como transient. Se crea una nueva instancia en cada `resolve`. Retorna el contenedor para encadenamiento de métodos.

### `Container.prototype.registerScoped(token, factory)`

Registra una fábrica como scoped. Dentro de un scope, la instancia se crea en el primer `resolve` y se almacena en caché para ese scope. Cada scope mantiene su propia caché. Los tokens Scoped no pueden resolverse desde el contenedor raíz. Retorna el contenedor para encadenamiento de métodos.

### `Container.prototype.use(source)`

Copia todos los registros de `source` (otro `Container`) a este contenedor. Solo se copian las entradas de fábrica y ciclo de vida — las cachés de instancias singleton no se comparten. Devuelve el contenedor para encadenamiento de métodos.

### `Container.prototype.resolve(token)`

Resuelve y retorna la instancia para el token dado. Lanza `ContainerError` si el token no está registrado o si se detecta una dependencia circular.

### `Container.prototype.tryResolve(token)`

Intenta resolver la instancia para el token dado. Devuelve `undefined` si el token no está registrado, en lugar de lanzar. Aún lanza `ContainerError` para dependencias circulares u operaciones en contenedores/scopes eliminados.

### `createScope(source)` — `katagami/scope`

Crea un nuevo `Scope` (contenedor hijo) a partir de un `Container` o un `Scope` existente.

### `class Scope`

Un contenedor hijo con scope creado por `createScope()`.

### `Scope.prototype.resolve(token)`

Resuelve y retorna la instancia para el token dado. Se comporta igual que `Container.prototype.resolve`, pero también puede resolver tokens Scoped.

### `Scope.prototype.tryResolve(token)`

Intenta resolver la instancia para el token dado. Devuelve `undefined` si el token no está registrado, en lugar de lanzar. Aún lanza `ContainerError` para dependencias circulares u operaciones en scopes eliminados.

### `lazy(source, token)` — `katagami/lazy`

Crea un Proxy que difiere `resolve()` hasta el primer acceso a una propiedad. La instancia resuelta se almacena en caché — los accesos posteriores usan la caché. Solo se admiten tokens de clase síncronos; los tokens asíncronos y PropertyKey se rechazan a nivel de tipos. Funciona con `Container`, `Scope`, `DisposableContainer` y `DisposableScope`.

### `disposable(container)` — `katagami/disposable`

Adjunta `[Symbol.asyncDispose]` a un `Container` o `Scope`, habilitando la sintaxis `await using`. Elimina todas las instancias gestionadas en orden inverso de creación (LIFO). Llama a `[Symbol.asyncDispose]()` o `[Symbol.dispose]()` en cada instancia que los implemente. Idempotente — las llamadas posteriores no hacen nada. Después de la eliminación, `resolve()` lanzará `ContainerError`. El tipo de retorno se reduce a `DisposableContainer` o `DisposableScope`, que solo exponen `resolve` y `tryResolve` — los métodos de registro se eliminan a nivel de tipos.

### `class ContainerError`

Clase de error lanzada para fallos del contenedor como resolver un token no registrado, dependencias circulares u operaciones en un contenedor/scope eliminado.

### `type Resolver`

Exportación de tipo que representa el resolver pasado a los callbacks de fábrica. Útil cuando necesitas tipar una función que acepta un parámetro resolver.

## Licencia

MIT
