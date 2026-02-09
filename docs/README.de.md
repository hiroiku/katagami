[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

Leichtgewichtiger TypeScript-DI-Container mit vollständiger Typinferenz.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> Der Name stammt von 型紙 _(katagami)_ — präzise Schablonenpapiere, die in der traditionellen japanischen Färbetechnik verwendet werden, um exakte Muster auf Stoff zu übertragen. Mehrere Schablonen werden übereinandergelegt, um kunstvolle Designs zu komponieren, genau wie sich Typen mit jedem Methodenkettenaufruf ansammeln. Eine Schablone benötigt nur Papier und einen Pinsel, keine aufwendige Maschinerie — ebenso benötigt Katagami keine Decorators oder Metadaten-Mechanismen und funktioniert mit jedem Build-Tool direkt einsatzbereit. Und wie Schablonen, die mit verschiedenen Stoffen und Techniken funktionieren, passt sich Katagami an TypeScript und JavaScript, Klassen-Token und PropertyKey-Token an — ein hybrider Ansatz für strikte, komponierbare DI.

## Funktionen

| Funktion                               | Beschreibung                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Vollständige Typinferenz               | Typen akkumulieren sich durch Methodenverkettung; nicht registrierte Token erzeugen Kompilierzeitfehler |
| Drei Lebenszyklen                      | Singleton, Transient und Scoped mit Kind-Containern                                                     |
| Asynchrone Factories                   | Promise-zurückgebende Factories werden automatisch vom Typsystem verfolgt                               |
| Erkennung zirkulärer Abhängigkeiten    | Klare Fehlermeldungen mit dem vollständigen Zykluspfad                                                  |
| Disposable-Unterstützung               | TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`)            |
| Verhinderung gefangener Abhängigkeiten | Singleton-/Transient-Factories können nicht auf Scoped-Token zugreifen; wird zur Kompilierzeit erkannt  |
| Optionale Auflösung                    | `tryResolve` gibt `undefined` für nicht registrierte Token zurück statt zu werfen                       |
| Hybride Token-Strategie                | Klassen-Token für strikte Typsicherheit, PropertyKey-Token für Flexibilität                             |
| Interface-Typ-Map                      | Übergeben Sie ein Interface an `createContainer<T>()` für reihenfolgeunabhängige Registrierung          |
| Null Abhängigkeiten                    | Keine Decorators, kein reflect-metadata, keine Polyfills                                                |

## Installation

```bash
npm install katagami
```

## Schnellstart

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
//    ^? UserService (vollständig inferiert)
userService.greet('world');
```

## Warum Katagami

Die meisten TypeScript-DI-Container basieren auf Decorators, reflect-metadata oder stringbasierten Token — jeder mit Kompromissen bei Toolkompatibilität, Typsicherheit oder Bundle-Größe. Katagami verfolgt einen anderen Ansatz.

### Keine Decorators, kein reflect-metadata

Decorator-basierte DI erfordert die Compiler-Optionen `experimentalDecorators` und `emitDecoratorMetadata`. Moderne Build-Tools wie esbuild und Vite (Standardkonfiguration) unterstützen `emitDecoratorMetadata` nicht, und der TC39-Standarddecorators-Vorschlag enthält kein Äquivalent für die automatische Typ-Metadaten-Emission. Katagami ist von nichts davon abhängig — es funktioniert mit jedem Build-Tool direkt einsatzbereit.

### Vollständige Typinferenz durch Klassen-Token

String-Token-DI zwingt Sie, manuelle Token-zu-Typ-Zuordnungen zu pflegen. Parameternamen-Matching bricht bei Minifizierung. Katagami verwendet Klassen direkt als Token, sodass `resolve` automatisch den korrekten Rückgabetyp inferiert — synchron oder `Promise` — ohne zusätzliche Annotationen.

### Methodenketten-Typakkumulation

Typen akkumulieren sich mit jedem `register`-Aufruf. Innerhalb einer Factory akzeptiert der Resolver nur Token, die an diesem Punkt in der Kette bereits registriert wurden. Das Auflösen eines nicht registrierten Tokens ist ein Kompilierzeitfehler, keine Laufzeitüberraschung.

### Hybride Token-Strategie

Klassen-Token bieten strikte, reihenfolgeabhängige Typsicherheit durch Methodenverkettung. Aber manchmal möchten Sie eine Reihe von Services vorab definieren und in beliebiger Reihenfolge registrieren. Übergeben Sie ein Interface an `createContainer<T>()` und verwenden Sie PropertyKey-Token — die Typ-Map wird zum Erstellungszeitpunkt festgelegt, sodass die Registrierungsreihenfolge keine Rolle spielt.

### Null Abhängigkeiten

Keine Laufzeitabhängigkeiten, keine Polyfills. Kein Bedarf, reflect-metadata (~50 KB unminifiziert) zu Ihrem Bundle hinzuzufügen.

## Leitfaden

### Singleton und Transient

Singleton erstellt die Instanz beim ersten `resolve` und speichert sie im Cache. Transient erstellt jedes Mal eine neue Instanz.

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

// Singleton — jedes Mal dieselbe Instanz
container.resolve(Database) === container.resolve(Database); // true

// Transient — jedes Mal eine neue Instanz
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Scoped-Lebenszyklus und Kind-Container

Scoped-Registrierungen verhalten sich innerhalb eines Scopes wie Singletons, erzeugen aber in jedem neuen Scope eine neue Instanz. Verwenden Sie `createScope()`, um einen Kind-Container zu erstellen. Scoped-Token können nicht vom Root-Container aufgelöst werden.

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

// Einen Scope für jede Anfrage erstellen
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — gleich innerhalb eines Scopes, unterschiedlich zwischen Scopes
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — über alle Scopes geteilt
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

Scopes können auch verschachtelt werden. Jeder verschachtelte Scope hat seinen eigenen Scoped-Instanz-Cache, während Singletons mit dem Eltern-Scope geteilt werden:

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// Jeder verschachtelte Scope bekommt eigene Scoped-Instanzen
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singletons werden weiterhin geteilt
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### Asynchrone Factories

Factories, die ein `Promise` zurückgeben, werden automatisch vom Typsystem verfolgt. Wenn Sie ein asynchrones Token auflösen, ist der Rückgabetyp `Promise<V>` statt `V`:

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
		await new Promise(r => setTimeout(r, 100)); // Asynchrone Initialisierung simulieren
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>  (nach await → Database)
db.connected; // true
```

Asynchrone Factories können sowohl von synchronen als auch von asynchronen Registrierungen abhängen:

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // synchron → Logger
		logger.log('Verbindung wird hergestellt...');
		return new Database(true);
	});
```

### Erkennung zirkulärer Abhängigkeiten

Katagami verfolgt, welche Token gerade aufgelöst werden. Wenn eine zirkuläre Abhängigkeit gefunden wird, wird ein `ContainerError` mit einer klaren Nachricht geworfen, die den vollständigen Zykluspfad zeigt:

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

Indirekte Zyklen werden ebenfalls erkannt:

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Disposable-Unterstützung

Sowohl `Container` als auch `Scope` implementieren `AsyncDisposable`. Bei der Freigabe werden verwaltete Instanzen in umgekehrter Erstellungsreihenfolge (LIFO) durchlaufen und ihre `[Symbol.asyncDispose]()` oder `[Symbol.dispose]()` Methoden werden automatisch aufgerufen.

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// Manuelle Freigabe
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

Mit `await using` werden Scopes am Ende des Blocks automatisch freigegeben:

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... conn verwenden ...
} // Scope wird hier freigegeben — Connection wird bereinigt, DbPool nicht
```

Die Scope-Freigabe betrifft nur Scoped-Instanzen. Singleton-Instanzen gehören dem Root-Container und werden freigegeben, wenn der Container selbst freigegeben wird.

### Interface-Typ-Map

Wenn Sie ein Interface an `createContainer<T>()` übergeben, werden PropertyKey-Token vom Interface typisiert, anstatt durch Verkettung akkumuliert zu werden. Das bedeutet, Sie können Token in beliebiger Reihenfolge registrieren und auflösen:

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
	// 'greeting' kann 'logger' referenzieren, obwohl es später registriert wird
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('Greeting wird erstellt...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### Hybride Token-Strategie

Sie können beide Ansätze mischen — verwenden Sie Klassen-Token für reihenfolgeabhängige Typsicherheit und PropertyKey-Token für reihenfolgeunabhängige Flexibilität:

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('Greeting wird erstellt...');
		return 'Hello!';
	});
```

### Verhinderung gefangener Abhängigkeiten

Eine „gefangene Abhängigkeit" tritt auf, wenn ein langlebiger Service (Singleton oder Transient) einen kurzlebigen Service (Scoped) einfängt und über seinen vorgesehenen Scope hinaus am Leben hält. Katagami verhindert dies zur Kompilierzeit — Singleton- und Transient-Factories erhalten nur einen Resolver, der auf nicht-Scoped-Token beschränkt ist:

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — Singleton-Factory kann keine Scoped-Token auflösen
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

Scoped-Factories hingegen können sowohl Scoped- als auch nicht-Scoped-Token auflösen:

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — Scoped-Factory kann Singleton-Token auflösen
		return new RequestContext();
	});
```

### Optionale Auflösung (tryResolve)

Wenn Sie optionale Abhängigkeiten handhaben möchten oder prüfen wollen, ob ein Token registriert ist, ohne einen Fehler zu werfen, verwenden Sie `tryResolve`. Im Gegensatz zu `resolve` gibt es `undefined` für nicht registrierte Token zurück, anstatt einen `ContainerError` zu werfen:

```ts
import { createContainer } from 'katagami';

class Logger {
	log(msg: string) {
		console.log(msg);
	}
}

class Analytics {
	track(event: string) {
		console.log(`Track: ${event}`);
	}
}

const container = createContainer().registerSingleton(Logger, () => new Logger());

// resolve wirft für nicht registrierte Token
container.resolve(Analytics); // ContainerError: Token "Analytics" is not registered.

// tryResolve gibt undefined für nicht registrierte Token zurück
const analytics = container.tryResolve(Analytics);
//    ^? Analytics | undefined
if (analytics) {
	analytics.track('event');
}
```

`tryResolve` ist besonders nützlich für optionale Abhängigkeiten in Factories. Im Gegensatz zu `resolve` akzeptiert es nicht registrierte Token ohne Kompilierungsfehler:

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('UserService', r => {
		const logger = r.tryResolve(Logger); // Optionale Abhängigkeit
		const analytics = r.tryResolve(Analytics); // Kein Kompilierungsfehler, obwohl Analytics nicht registriert ist

		return {
			greet(name: string) {
				logger?.log(`Hello, ${name}`);
				analytics?.track('user_greeted');
			},
		};
	});
```

`tryResolve` wirft immer noch einen `ContainerError` bei zirkulären Abhängigkeiten und Operationen auf freigegebenen Containern/Scopes — nur nicht registrierte Token geben `undefined` zurück.

## API

### `createContainer<T, ScopedT>()`

Erstellt einen neuen DI-Container. Übergeben Sie ein Interface als `T`, um die Typ-Map für PropertyKey-Token zu definieren. Übergeben Sie `ScopedT`, um eine separate Typ-Map für Scoped-PropertyKey-Token zu definieren (reihenfolgeunabhängig, genau wie `T`).

### `container.registerSingleton(token, factory)`

Registriert eine Factory als Singleton. Die Instanz wird beim ersten `resolve` erstellt und danach gecacht. Gibt den Container für Methodenverkettung zurück.

### `container.registerTransient(token, factory)`

Registriert eine Factory als Transient. Bei jedem `resolve` wird eine neue Instanz erstellt. Gibt den Container für Methodenverkettung zurück.

### `container.registerScoped(token, factory)`

Registriert eine Factory als Scoped. Innerhalb eines Scopes wird die Instanz beim ersten `resolve` erstellt und für diesen Scope gecacht. Jeder Scope pflegt seinen eigenen Cache. Scoped-Token können nicht vom Root-Container aufgelöst werden. Gibt den Container für Methodenverkettung zurück.

### `container.resolve(token)`

Löst die Instanz für das gegebene Token auf und gibt sie zurück. Wirft `ContainerError`, wenn das Token nicht registriert ist oder eine zirkuläre Abhängigkeit erkannt wird.

### `container.tryResolve(token)` / `scope.tryResolve(token)`

Versucht, die Instanz für das gegebene Token aufzulösen. Gibt `undefined` zurück, wenn das Token nicht registriert ist, anstatt zu werfen. Wirft immer noch `ContainerError` bei zirkulären Abhängigkeiten oder Operationen auf freigegebenen Containern/Scopes.

### `container.createScope()`

Erstellt einen neuen `Scope` (Kind-Container). Der Scope erbt alle Registrierungen vom Eltern-Container. Singleton-Instanzen werden mit dem Eltern-Container geteilt, während Scoped-Instanzen lokal zum Scope sind.

### `Scope`

Ein Scoped-Kind-Container, erstellt durch `createScope()`. Bietet `resolve(token)`, `tryResolve(token)`, `createScope()` (für verschachtelte Scopes) und `[Symbol.asyncDispose]()`.

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

Gibt alle verwalteten Instanzen in umgekehrter Erstellungsreihenfolge (LIFO) frei. Ruft `[Symbol.asyncDispose]()` oder `[Symbol.dispose]()` für jede Instanz auf, die diese implementiert. Idempotent — nachfolgende Aufrufe sind No-Ops. Nach der Freigabe werfen `resolve()` und `createScope()` einen `ContainerError`.

### `ContainerError`

Fehlerklasse, die bei Container-Fehlern geworfen wird, wie z. B. das Auflösen eines nicht registrierten Tokens, zirkuläre Abhängigkeiten oder Operationen auf einem freigegebenen Container/Scope.

### `Resolver`

Typexport, der den an Factory-Callbacks übergebenen Resolver repräsentiert. Nützlich, wenn Sie eine Funktion typisieren müssen, die einen Resolver-Parameter akzeptiert.

## Lizenz

MIT
