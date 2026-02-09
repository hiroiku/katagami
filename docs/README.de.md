[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

Leichtgewichtiger TypeScript-DI-Container mit vollständiger Typinferenz.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> Der Name stammt von 型紙 _(katagami)_ — präzise Schablonenpapiere, die in der traditionellen japanischen Färbetechnik verwendet werden, um exakte Muster auf Stoff zu übertragen. Mehrere Schablonen werden übereinandergelegt, um kunstvolle Designs zu komponieren, genau wie sich Typen mit jedem Methodenkettenaufruf ansammeln. Jede Schablone ist ein eigenständiges Stück — nur die für die aktuelle Arbeit benötigte wird ausgewählt, der Rest bleibt liegen — genauso wie Subpath-Exports sicherstellen, dass nur der Code, den Sie verwenden, in Ihr Bundle gelangt. Das ausgeschnittene Muster bestimmt genau, wo Farbe durchdringt und wo sie blockiert wird, ähnlich wie Katagamis Typsystem Fehler zur Kompilierzeit erkennt, nicht zur Laufzeit. Und eine Schablone benötigt nur Papier und einen Pinsel, keine aufwendige Maschinerie — ebenso benötigt Katagami keine Decorators oder Metadaten-Mechanismen und funktioniert mit jedem Build-Tool direkt einsatzbereit.

## Funktionen

| Funktion                               | Beschreibung                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Null Abhängigkeiten                    | Keine Decorators, kein reflect-metadata, keine Polyfills — funktioniert mit jedem Bundler direkt einsatzbereit                    |
| Vollständige Typinferenz               | Typen akkumulieren sich durch Methodenverkettung; nicht registrierte Token erzeugen Kompilierzeitfehler                           |
| Tree-Shaking-fähig                     | Subpath-Exports (`katagami/scope`, `katagami/disposable`) und `sideEffects: false` für minimale Bundle-Größe                      |
| Verhinderung gefangener Abhängigkeiten | Singleton-/Transient-Factories können nicht auf Scoped-Token zugreifen; wird zur Kompilierzeit und zur Laufzeit in Scopes erkannt |
| Hybride Token-Strategie                | Klassen-Token für strikte Typsicherheit, PropertyKey-Token für Flexibilität                                                       |
| Interface-Typ-Map                      | Übergeben Sie ein Interface an `createContainer<T>()` für reihenfolgeunabhängige Registrierung                                    |
| Drei Lebenszyklen                      | Singleton, Transient und Scoped mit Kind-Containern                                                                               |
| Disposable-Unterstützung               | TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`)                                      |
| Modulkomposition                       | Container können mit `use()` komponiert werden, um Registrierungen zu gruppieren und wiederzuverwenden                            |
| Asynchrone Factories                   | Promise-zurückgebende Factories werden automatisch vom Typsystem verfolgt                                                         |
| Erkennung zirkulärer Abhängigkeiten    | Klare Fehlermeldungen mit dem vollständigen Zykluspfad                                                                            |
| Optionale Auflösung                    | `tryResolve` gibt `undefined` für nicht registrierte Token zurück statt zu werfen                                                 |
| Verzögerte Auflösung                   | Proxy-basierte verzögerte Instanziierung über `lazy()` aus `katagami/lazy`; Instanz wird beim ersten Zugriff erstellt             |

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

### Tree-Shaking-fähig

Katagami ist in Subpath-Exports aufgeteilt. Importieren Sie nur, was Sie brauchen — `katagami/scope`, `katagami/disposable` und `katagami/lazy` werden vollständig aus dem Bundle eliminiert, wenn sie nicht importiert werden. In Kombination mit `sideEffects: false` können Bundler jedes ungenutzte Byte entfernen.

```ts
// Nur der Kern — scope, disposable und lazy sind nicht im Bundle enthalten
import { createContainer } from 'katagami';

// Importieren Sie nur, was Sie brauchen
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

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

Scoped-Registrierungen verhalten sich innerhalb eines Scopes wie Singletons, erzeugen aber in jedem neuen Scope eine neue Instanz. Importieren Sie `createScope` aus `katagami/scope`, um einen Kind-Container zu erstellen. Scoped-Token können nicht vom Root-Container aufgelöst werden.

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

// Einen Scope für jede Anfrage erstellen
const scope1 = createScope(root);
const scope2 = createScope(root);

// Scoped — gleich innerhalb eines Scopes, unterschiedlich zwischen Scopes
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — über alle Scopes geteilt
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

Scopes können auch verschachtelt werden. Jeder verschachtelte Scope hat seinen eigenen Scoped-Instanz-Cache, während Singletons mit dem Eltern-Scope geteilt werden:

```ts
const parentScope = createScope(root);
const childScope = createScope(parentScope);

// Jeder verschachtelte Scope bekommt eigene Scoped-Instanzen
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Singletons werden weiterhin geteilt
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### Modulkomposition

Gruppieren Sie zusammengehörige Registrierungen in einem wiederverwendbaren Modul, indem Sie einen Container mit `createContainer()` erstellen, und wenden Sie ihn mit `use()` auf einen anderen Container an. Es werden nur Registrierungseinträge (Factory und Lebenszyklus) kopiert — Singleton-Instanz-Caches werden nicht geteilt.

```ts
import { createContainer } from 'katagami';

class AuthService {
	authenticate() {
		return true;
	}
}

class TokenService {
	issue() {
		return 'token';
	}
}

class UserService {
	constructor(private auth: AuthService, private tokens: TokenService) {}
}

// Ein wiederverwendbares Modul definieren
const authModule = createContainer()
	.registerSingleton(AuthService, () => new AuthService())
	.registerSingleton(TokenService, () => new TokenService());

// Module komponieren
const container = createContainer()
	.use(authModule)
	.registerSingleton(UserService, r => new UserService(r.resolve(AuthService), r.resolve(TokenService)));
```

Module können auch andere Module komponieren:

```ts
const infraModule = createContainer().registerSingleton(AuthService, () => new AuthService());

const appModule = createContainer()
	.use(infraModule)
	.registerSingleton(UserService, r => new UserService(r.resolve(AuthService), r.resolve(TokenService)));

// appModule enthält sowohl AuthService als auch UserService
const container = createContainer().use(appModule);
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

Die Freigabe wird durch den `disposable()`-Wrapper aus `katagami/disposable` bereitgestellt. Das Wrappen eines Containers oder Scopes fügt `[Symbol.asyncDispose]` hinzu und ermöglicht die `await using`-Syntax. Bei der Freigabe werden verwaltete Instanzen in umgekehrter Erstellungsreihenfolge (LIFO) durchlaufen und ihre `[Symbol.asyncDispose]()` oder `[Symbol.dispose]()` Methoden werden automatisch aufgerufen.

```ts
import { createContainer } from 'katagami';
import { disposable } from 'katagami/disposable';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// Manuelle Freigabe
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

Mit `await using` werden Scopes am Ende des Blocks automatisch freigegeben:

```ts
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = disposable(createScope(root));
	const conn = scope.resolve(Connection);
	// ... conn verwenden ...
} // Scope wird hier freigegeben — Connection wird bereinigt, DbPool nicht
```

Die Scope-Freigabe betrifft nur Scoped-Instanzen. Singleton-Instanzen gehören dem Root-Container und werden freigegeben, wenn der Container selbst freigegeben wird.

Der `disposable()`-Wrapper verengt auch den Rückgabetyp, sodass Registrierungsmethoden (`registerSingleton`, `registerTransient`, `registerScoped`, `use`) auf Typebene entfernt werden. Dies verhindert versehentliche Registrierungen an einem möglicherweise entsorgten Container:

```ts
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection); // OK
container.registerSingleton(/* ... */); // Kompilierungsfehler
```

### Verzögerte Auflösung (Lazy Resolution)

Die `lazy()`-Funktion aus `katagami/lazy` erstellt einen Proxy, der die Instanzerstellung bis zum ersten Property-Zugriff verzögert. Dies ist nützlich zur Optimierung der Startzeit oder zum Aufbrechen zirkulärer Abhängigkeiten.

```ts
import { createContainer } from 'katagami';
import { lazy } from 'katagami/lazy';

class HeavyService {
	constructor() {
		// aufwendige Initialisierung
	}
	process() {
		return 'done';
	}
}

const container = createContainer().registerSingleton(HeavyService, () => new HeavyService());

const service = lazy(container, HeavyService);
// HeavyService ist noch NICHT instanziiert

service.process(); // Instanz wird hier erstellt und gecacht
service.process(); // verwendet die gecachte Instanz
```

Der Proxy leitet transparent alle Property-Zugriffe, Methodenaufrufe, `in`-Prüfungen und Prototyp-Lookups an die echte Instanz weiter. Methoden werden automatisch an die echte Instanz gebunden, sodass `this` auch bei Destrukturierung korrekt funktioniert.

Nur **synchrone Klassen-Token** werden unterstützt. Asynchrone Token und PropertyKey-Token werden auf Typebene abgelehnt, da Proxy-Traps synchron sind.

`lazy()` funktioniert mit Container, Scope, DisposableContainer und DisposableScope:

```ts
import { createScope } from 'katagami/scope';

const root = createContainer().registerScoped(RequestContext, () => new RequestContext());
const scope = createScope(root);

const ctx = lazy(scope, RequestContext); // verzögerte Scoped-Auflösung
```

### Tree Shaking

Katagami verwendet Subpath-Exports, um Funktionalität in unabhängige Einstiegspunkte aufzuteilen. Wenn Sie nur den Kern-Container benötigen, werden `katagami/scope`, `katagami/disposable` und `katagami/lazy` vollständig aus dem Bundle ausgeschlossen. Das Paket deklariert `sideEffects: false`, sodass Bundler ungenutzten Code sicher entfernen können.

```ts
// Nur der Kern — scope, disposable und lazy sind nicht im Bundle enthalten
import { createContainer } from 'katagami';

// Importieren Sie nur, was Sie brauchen
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

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

Katagami erzwingt diese Regel auch zur Laufzeit innerhalb von Scopes. Wenn eine Singleton-Factory versucht, ein Scoped-Token aufzulösen — direkt oder über Zwischenstationen — wird ein `ContainerError` geworfen:

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

### `Container.prototype.registerSingleton(token, factory)`

Registriert eine Factory als Singleton. Die Instanz wird beim ersten `resolve` erstellt und danach gecacht. Gibt den Container für Methodenverkettung zurück.

### `Container.prototype.registerTransient(token, factory)`

Registriert eine Factory als Transient. Bei jedem `resolve` wird eine neue Instanz erstellt. Gibt den Container für Methodenverkettung zurück.

### `Container.prototype.registerScoped(token, factory)`

Registriert eine Factory als Scoped. Innerhalb eines Scopes wird die Instanz beim ersten `resolve` erstellt und für diesen Scope gecacht. Jeder Scope pflegt seinen eigenen Cache. Scoped-Token können nicht vom Root-Container aufgelöst werden. Gibt den Container für Methodenverkettung zurück.

### `Container.prototype.use(source)`

Kopiert alle Registrierungen von `source` (einem anderen `Container`) in diesen Container. Es werden nur Factory- und Lebenszyklus-Einträge kopiert — Singleton-Instanz-Caches werden nicht geteilt. Gibt den Container für Method-Chaining zurück.

### `Container.prototype.resolve(token)`

Löst die Instanz für das gegebene Token auf und gibt sie zurück. Wirft `ContainerError`, wenn das Token nicht registriert ist oder eine zirkuläre Abhängigkeit erkannt wird.

### `Container.prototype.tryResolve(token)`

Versucht, die Instanz für das gegebene Token aufzulösen. Gibt `undefined` zurück, wenn das Token nicht registriert ist, anstatt zu werfen. Wirft immer noch `ContainerError` bei zirkulären Abhängigkeiten oder Operationen auf freigegebenen Containern/Scopes.

### `createScope(source)` — `katagami/scope`

Erstellt einen neuen `Scope` (Kind-Container) aus einem `Container` oder einem bestehenden `Scope`.

### `class Scope`

Ein Scoped-Kind-Container, erstellt durch `createScope()`.

### `Scope.prototype.resolve(token)`

Löst die Instanz für das gegebene Token auf und gibt sie zurück. Verhält sich wie `Container.prototype.resolve`, kann aber auch Scoped-Token auflösen.

### `Scope.prototype.tryResolve(token)`

Versucht, die Instanz für das gegebene Token aufzulösen. Gibt `undefined` zurück, wenn das Token nicht registriert ist, anstatt zu werfen. Wirft immer noch `ContainerError` bei zirkulären Abhängigkeiten oder Operationen auf freigegebenen Scopes.

### `lazy(source, token)` — `katagami/lazy`

Erstellt einen Proxy, der `resolve()` bis zum ersten Property-Zugriff verzögert. Die aufgelöste Instanz wird gecacht — nachfolgende Zugriffe verwenden den Cache. Nur synchrone Klassen-Token werden unterstützt; asynchrone Token und PropertyKey-Token werden auf Typebene abgelehnt. Funktioniert mit `Container`, `Scope`, `DisposableContainer` und `DisposableScope`.

### `disposable(container)` — `katagami/disposable`

Fügt `[Symbol.asyncDispose]` einem `Container` oder `Scope` hinzu und ermöglicht die `await using`-Syntax. Gibt alle verwalteten Instanzen in umgekehrter Erstellungsreihenfolge (LIFO) frei. Ruft `[Symbol.asyncDispose]()` oder `[Symbol.dispose]()` für jede Instanz auf, die diese implementiert. Idempotent — nachfolgende Aufrufe sind No-Ops. Nach der Freigabe wirft `resolve()` einen `ContainerError`. Der Rückgabetyp wird auf `DisposableContainer` oder `DisposableScope` verengt, die nur `resolve` und `tryResolve` exponieren — Registrierungsmethoden werden auf Typebene entfernt.

### `class ContainerError`

Fehlerklasse, die bei Container-Fehlern geworfen wird, wie z. B. das Auflösen eines nicht registrierten Tokens, zirkuläre Abhängigkeiten oder Operationen auf einem freigegebenen Container/Scope.

### `type Resolver`

Typexport, der den an Factory-Callbacks übergebenen Resolver repräsentiert. Nützlich, wenn Sie eine Funktion typisieren müssen, die einen Resolver-Parameter akzeptiert.

## Lizenz

MIT
