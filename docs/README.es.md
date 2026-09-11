[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**Inyección de dependencias con seguridad de tipos para TypeScript.**

Haz explícitas y verificables las dependencias, incluso cuando el código lo escriben agentes de IA. Katagami acumula tipos con cada registro, comprueba los tokens accesibles en cada fábrica y conserva los resultados asíncronos. Sin decoradores, reflect-metadata ni dependencias en tiempo de ejecución.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## Inicio rápido

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## Por qué elegir Katagami: comparación

Katagami combina **tipos derivados del registro, restricciones de ámbito en compilación y cero dependencias de ejecución** en factorías de TypeScript normales. No requiere decoradores ni metadatos. La liberación de recursos y la resolución diferida tienen puntos de entrada separados.

**Revisado el 2026-09-11**, con versiones estables de npm y fuentes oficiales. Consulta las [versiones y fuentes](./choosing-di.md#comparison-sources) y la [comparación completa de asincronía y liberación de recursos](../README.md#library-comparison).

| Biblioteca / versión | Tipos y comprobación de registros | Política de ámbitos |
| --- | --- | --- |
| **Katagami 3.0.3** | **Acumula tokens literales/unique symbol; rechaza tokens requeridos sin registrar** | **Excluye tokens Scoped del resolver de factorías Singleton/Transient** |
| InversifyJS 8.2.3 | Bindings tipados; existencia comprobada en ejecución | Ciclo de vida configurado por binding |
| tsyringe 4.10.0 | Tipos de clase/genéricos; registros comprobados en ejecución | Ciclos de vida y contenedores hijos |
| TypeDI 0.10.0 | Clases y `Token<T>`; registros comprobados en ejecución | Servicios compartidos/Transient y contenedores con nombre |
| Awilix 13.0.5 | Infiere el cradle del registro; el `resolve` amplio acepta nombres desconocidos | `strict: true` comprueba fugas de ciclo de vida en ejecución |
| NestJS 12.0.1 | Providers tipados; grafo resuelto en ejecución | Request se propaga a los providers dependientes |
| Effect 3.22.2 | Requisitos de servicios en los tipos `Effect`/`Layer` | `Scope` tipado y finalizadores |
| typed-inject 5.0.0 | Acumula tokens de cadena y comprueba tuplas `inject` | Singleton, Transient e injectores hijos |

Awilix, Effect y typed-inject también ofrecen comprobaciones de tipos. Katagami combina las de registro y ámbito con llamadas directas a `r.resolve(token)`. Se aplican los [límites de tokens, clases y referencias mutables](./type-safety.md).

## Uso con agentes de programación de IA

El agente modifica las dependencias, ejecuta el comprobador de TypeScript y corrige el código a partir de los diagnósticos. Las fábricas explícitas muestran las dependencias en código TypeScript normal.

Por ejemplo, acceder a un estado Scoped desde una fábrica Singleton produce un error de tipos.

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

En este ejemplo, registra handler con registerScoped. @ts-expect-error verifica el ejemplo incorrecto en CI; en la aplicación, corrige el ciclo de vida y ejecuta npx tsc --noEmit sin suprimir el error.

## Tipos acumulados y garantías

createContainer() acumula los tipos de los registros. Si se conservan las claves literales y los tipos unique symbol, se rechazan los tokens fuera del conjunto visible de registros. No hace falta un mapa manual de servicios.

Los tokens de clase siguen el tipado estructural: otra clase compatible puede ser aceptada. Una clave declarada en createContainer<Services>() también puede estar disponible en los tipos sin tener un registro real.

Incluye ciclos de vida Singleton, Transient y Scoped, composición con use(), fábricas asíncronas, resolución opcional y múltiple, limpieza de recursos y resolución diferida. Para pocas dependencias, los parámetros normales pueden ser suficientes.

## Guías y ejemplo ejecutable

- [Guía para agentes de IA (inglés)](./ai-coding-agents.md)
- [Garantías de tipos (inglés)](./type-safety.md)
- [Guía de uso y API (inglés)](./guide.md)
- [Ejemplo de ámbitos por petición (inglés)](../examples/request-scope/README.md)
- [Cómo elegir DI (inglés)](./choosing-di.md)

CI comprueba los ejemplos de tipos y las pruebas de ejecución. No se han medido mejoras en la tasa de reparación de agentes ni ahorro de tokens.

El nombre viene de 型紙, las plantillas de papel de la tintura tradicional japonesa. Los tipos se acumulan como capas de plantillas.

MIT
