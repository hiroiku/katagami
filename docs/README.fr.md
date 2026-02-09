[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

Conteneur DI léger pour TypeScript avec inférence de types complète.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> Le nom vient de 型紙 _(katagami)_ — un papier pochoir de précision utilisé dans la teinture traditionnelle japonaise pour transférer des motifs exacts sur le tissu. Plusieurs pochoirs sont superposés pour composer des motifs complexes, tout comme les types s'accumulent à chaque appel dans la chaîne de méthodes. Chaque pochoir est une pièce autonome — on ne prend que celui nécessaire au travail en cours, les autres restent de côté — tout comme les exports par sous-chemin garantissent que seul le code utilisé entre dans votre bundle. Le motif découpé détermine exactement où la teinture passe et où elle est bloquée, tout comme le système de types de Katagami détecte les erreurs à la compilation, pas à l'exécution. Et un pochoir ne nécessite que du papier et un pinceau, pas de machinerie élaborée — de même, Katagami ne requiert ni décorateurs ni mécanismes de métadonnées et fonctionne avec n'importe quel outil de build sans configuration.

## Fonctionnalités

| Fonctionnalité                        | Description                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Zéro dépendance                       | Pas de décorateurs, pas de reflect-metadata, pas de polyfills — fonctionne avec n'importe quel bundler sans configuration              |
| Inférence de types complète           | Les types s'accumulent par chaînage de méthodes ; les tokens non enregistrés provoquent des erreurs à la compilation                   |
| Tree-shakeable                        | Exports par sous-chemin (`katagami/scope`, `katagami/disposable`) et `sideEffects: false` pour une taille de bundle minimale           |
| Prévention des dépendances captives   | Les factories Singleton/Transient ne peuvent pas accéder aux tokens Scoped ; détecté à la compilation et à l'exécution dans les scopes |
| Stratégie de tokens hybride           | Tokens de classe pour une sécurité de types stricte, tokens PropertyKey pour la flexibilité                                            |
| Carte de types par interface          | Passez une interface à `createContainer<T>()` pour un enregistrement indépendant de l'ordre                                            |
| Trois cycles de vie                   | Singleton, Transient et Scoped avec conteneurs enfants                                                                                 |
| Support Disposable                    | TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`)                                           |
| Composition de modules                | Les conteneurs peuvent être composés via `use()` pour grouper et réutiliser les enregistrements                                        |
| Factories asynchrones                 | Les factories retournant des Promise sont automatiquement suivies par le système de types                                              |
| Détection des dépendances circulaires | Messages d'erreur clairs avec le chemin complet du cycle                                                                               |
| Résolution optionnelle                | `tryResolve` retourne `undefined` pour les tokens non enregistrés au lieu de lever une exception                                       |
| Résolution différée                   | Instanciation différée basée sur Proxy via `lazy()` de `katagami/lazy` ; instance créée au premier accès                               |

## Installation

```bash
npm install katagami
```

## Démarrage rapide

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
//    ^? UserService (entièrement inféré)
userService.greet('world');
```

## Pourquoi Katagami

La plupart des conteneurs DI TypeScript reposent sur des décorateurs, reflect-metadata ou des tokens basés sur des chaînes de caractères — chacun apportant des compromis en matière de compatibilité des outils, de sécurité de types ou de taille du bundle. Katagami adopte une approche différente.

### Pas de décorateurs, pas de reflect-metadata

La DI basée sur les décorateurs nécessite les options du compilateur `experimentalDecorators` et `emitDecoratorMetadata`. Les outils de build modernes comme esbuild et Vite (configuration par défaut) ne supportent pas `emitDecoratorMetadata`, et la proposition de décorateurs standard TC39 n'inclut pas d'équivalent pour l'émission automatique de métadonnées de types. Katagami ne dépend d'aucun de ces éléments — il fonctionne avec n'importe quel outil de build sans configuration.

### Tree-shakeable

Katagami est divisé en exports par sous-chemin. Importez uniquement ce dont vous avez besoin — `katagami/scope`, `katagami/disposable` et `katagami/lazy` sont complètement éliminés du bundle s'ils ne sont pas importés. Combiné avec `sideEffects: false`, les bundlers peuvent supprimer chaque octet inutilisé.

```ts
// Noyau uniquement — scope, disposable et lazy ne sont pas inclus dans le bundle
import { createContainer } from 'katagami';

// Importez uniquement ce dont vous avez besoin
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

### Inférence de types complète à partir des tokens de classe

La DI avec des tokens de chaîne vous oblige à maintenir des correspondances manuelles entre tokens et types. La correspondance par nom de paramètre casse lors de la minification. Katagami utilise les classes directement comme tokens, donc `resolve` infère automatiquement le type de retour correct — synchrone ou `Promise` — sans annotations supplémentaires.

### Accumulation de types par chaîne de méthodes

Les types s'accumulent à chaque appel `register`. À l'intérieur d'une factory, le resolver n'accepte que les tokens déjà enregistrés à ce point de la chaîne. Résoudre un token non enregistré est une erreur de compilation, pas une surprise à l'exécution.

### Stratégie de tokens hybride

Les tokens de classe vous offrent une sécurité de types stricte et dépendante de l'ordre via le chaînage de méthodes. Mais parfois vous voulez définir un ensemble de services à l'avance et les enregistrer dans n'importe quel ordre. Passez une interface à `createContainer<T>()` et utilisez des tokens PropertyKey — la carte de types est fixée au moment de la création, donc l'ordre d'enregistrement n'a pas d'importance.

### Zéro dépendance

Aucune dépendance à l'exécution, aucun polyfill. Pas besoin d'ajouter reflect-metadata (~50 Ko non minifié) à votre bundle.

## Guide

### Singleton et Transient

Singleton crée l'instance au premier `resolve` et la met en cache. Transient crée une nouvelle instance à chaque fois.

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

// Singleton — toujours la même instance
container.resolve(Database) === container.resolve(Database); // true

// Transient — nouvelle instance à chaque fois
container.resolve(RequestHandler) === container.resolve(RequestHandler); // false
```

### Cycle de vie Scoped et conteneurs enfants

Les enregistrements Scoped se comportent comme des singletons au sein d'un scope mais produisent une instance fraîche dans chaque nouveau scope. Importez `createScope` depuis `katagami/scope` pour créer un conteneur enfant. Les tokens Scoped ne peuvent pas être résolus depuis le conteneur racine.

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

// Créer un scope pour chaque requête
const scope1 = createScope(root);
const scope2 = createScope(root);

// Scoped — identique au sein d'un scope, différent entre les scopes
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — partagé entre tous les scopes
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

Les scopes peuvent aussi être imbriqués. Chaque scope imbriqué possède son propre cache d'instances Scoped tout en partageant les singletons avec son parent :

```ts
const parentScope = createScope(root);
const childScope = createScope(parentScope);

// Chaque scope imbriqué obtient ses propres instances Scoped
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Les singletons sont toujours partagés
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
```

### Composition de modules

Regroupez les enregistrements liés dans un module réutilisable en créant un conteneur avec `createContainer()`, puis appliquez-le à un autre conteneur avec `use()`. Seuls les entrées d'enregistrement (factory et cycle de vie) sont copiés — les caches d'instances singleton ne sont pas partagés.

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

// Définir un module réutilisable
const authModule = createContainer()
	.registerSingleton(AuthService, () => new AuthService())
	.registerSingleton(TokenService, () => new TokenService());

// Composer des modules
const container = createContainer()
	.use(authModule)
	.registerSingleton(UserService, r => new UserService(r.resolve(AuthService), r.resolve(TokenService)));
```

Les modules peuvent également composer d'autres modules :

```ts
const infraModule = createContainer().registerSingleton(AuthService, () => new AuthService());

const appModule = createContainer()
	.use(infraModule)
	.registerSingleton(UserService, r => new UserService(r.resolve(AuthService), r.resolve(TokenService)));

// appModule contient à la fois AuthService et UserService
const container = createContainer().use(appModule);
```

### Factories asynchrones

Les factories qui retournent une `Promise` sont automatiquement suivies par le système de types. Quand vous résolvez un token asynchrone, le type de retour est `Promise<V>` au lieu de `V` :

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
		await new Promise(r => setTimeout(r, 100)); // simuler une initialisation asynchrone
		return new Database(true);
	});

const logger = container.resolve(Logger);
//    ^? Logger

const db = await container.resolve(Database);
//    ^? Promise<Database>  (après await → Database)
db.connected; // true
```

Les factories asynchrones peuvent dépendre à la fois d'enregistrements synchrones et asynchrones :

```ts
const container = createContainer()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton(Database, async r => {
		const logger = r.resolve(Logger); // synchrone → Logger
		logger.log('Connexion en cours...');
		return new Database(true);
	});
```

### Détection des dépendances circulaires

Katagami suit les tokens en cours de résolution. Si une dépendance circulaire est trouvée, une `ContainerError` est levée avec un message clair montrant le chemin complet du cycle :

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

Les cycles indirects sont également détectés :

```
ContainerError: Circular dependency detected: ServiceX -> ServiceY -> ServiceZ -> ServiceX
```

### Support Disposable

La suppression est fournie par le wrapper `disposable()` de `katagami/disposable`. Envelopper un conteneur ou un scope lui attache `[Symbol.asyncDispose]`, permettant la syntaxe `await using`. Lors de la suppression, les instances gérées sont parcourues dans l'ordre inverse de création (LIFO) et leurs méthodes `[Symbol.asyncDispose]()` ou `[Symbol.dispose]()` sont appelées automatiquement.

```ts
import { createContainer } from 'katagami';
import { disposable } from 'katagami/disposable';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// Suppression manuelle
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

Avec `await using`, les scopes sont automatiquement supprimés à la fin du bloc :

```ts
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';

const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = disposable(createScope(root));
	const conn = scope.resolve(Connection);
	// ... utiliser conn ...
} // le scope est supprimé ici — Connection est nettoyé, DbPool ne l'est pas
```

La suppression du scope n'affecte que les instances Scoped. Les instances Singleton appartiennent au conteneur racine et sont supprimées lorsque le conteneur lui-même est supprimé.

Le wrapper `disposable()` restreint également le type de retour, supprimant les méthodes d'enregistrement (`registerSingleton`, `registerTransient`, `registerScoped`, `use`) au niveau des types. Cela empêche les enregistrements accidentels sur un conteneur potentiellement disposé :

```ts
const container = disposable(createContainer().registerSingleton(Connection, () => new Connection()));

container.resolve(Connection); // OK
container.registerSingleton(/* ... */); // Erreur à la compilation
```

### Résolution différée (Lazy Resolution)

La fonction `lazy()` de `katagami/lazy` crée un proxy qui diffère la création d'instance jusqu'au premier accès à une propriété. C'est utile pour optimiser le temps de démarrage ou résoudre les dépendances circulaires.

```ts
import { createContainer } from 'katagami';
import { lazy } from 'katagami/lazy';

class HeavyService {
	constructor() {
		// initialisation coûteuse
	}
	process() {
		return 'done';
	}
}

const container = createContainer().registerSingleton(HeavyService, () => new HeavyService());

const service = lazy(container, HeavyService);
// HeavyService n'est PAS encore instancié

service.process(); // instance créée ici, puis mise en cache
service.process(); // utilise l'instance en cache
```

Le proxy transfère de manière transparente tous les accès aux propriétés, appels de méthodes, vérifications `in` et consultations de prototype vers l'instance réelle. Les méthodes sont automatiquement liées à l'instance réelle, donc `this` fonctionne correctement même lors de la déstructuration.

Seuls les **tokens de classe synchrones** sont supportés. Les tokens asynchrones et les tokens PropertyKey sont rejetés au niveau des types car les traps de Proxy sont synchrones.

`lazy()` fonctionne avec Container, Scope, DisposableContainer et DisposableScope :

```ts
import { createScope } from 'katagami/scope';

const root = createContainer().registerScoped(RequestContext, () => new RequestContext());
const scope = createScope(root);

const ctx = lazy(scope, RequestContext); // résolution scoped différée
```

### Tree Shaking

Katagami utilise des exports par sous-chemin pour diviser les fonctionnalités en points d'entrée indépendants. Si vous n'avez besoin que du conteneur principal, `katagami/scope`, `katagami/disposable` et `katagami/lazy` sont complètement exclus du bundle. Le paquet déclare `sideEffects: false`, permettant aux bundlers de supprimer en toute sécurité tout code inutilisé.

```ts
// Noyau uniquement — scope, disposable et lazy ne sont pas inclus dans le bundle
import { createContainer } from 'katagami';

// Importez uniquement ce dont vous avez besoin
import { createScope } from 'katagami/scope';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
```

### Carte de types par interface

Quand vous passez une interface à `createContainer<T>()`, les tokens PropertyKey sont typés depuis l'interface plutôt qu'accumulés par chaînage. Cela signifie que vous pouvez enregistrer et résoudre des tokens dans n'importe quel ordre :

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
	// 'greeting' peut référencer 'logger' même s'il est enregistré après
	.registerSingleton('greeting', r => {
		r.resolve('logger').log('Construction du greeting...');
		return 'Hello!';
	})
	.registerSingleton('logger', () => new Logger());

const greeting = container.resolve('greeting');
//    ^? string
```

### Stratégie de tokens hybride

Vous pouvez mélanger les deux approches — utilisez des tokens de classe pour la sécurité de types dépendante de l'ordre et des tokens PropertyKey pour la flexibilité indépendante de l'ordre :

```ts
const container = createContainer<Services>()
	.registerSingleton(Logger, () => new Logger())
	.registerSingleton('logger', () => new Logger())
	.registerSingleton('greeting', r => {
		r.resolve(Logger).log('Construction du greeting...');
		return 'Hello!';
	});
```

### Prévention des dépendances captives

Une « dépendance captive » survient quand un service à longue durée de vie (singleton ou transient) capture un service à courte durée de vie (scoped), le maintenant en vie au-delà de son scope prévu. Katagami empêche cela à la compilation — les factories singleton et transient ne reçoivent qu'un resolver limité aux tokens non Scoped :

```ts
import { createContainer } from 'katagami';

class DbPool {}
class RequestContext {}

const container = createContainer()
	.registerScoped(RequestContext, () => new RequestContext())
	// @ts-expect-error — la factory singleton ne peut pas résoudre les tokens Scoped
	.registerSingleton(DbPool, r => new DbPool(r.resolve(RequestContext)));
```

Les factories Scoped, en revanche, peuvent résoudre à la fois les tokens Scoped et non Scoped :

```ts
const container = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(RequestContext, r => {
		r.resolve(DbPool); // OK — la factory Scoped peut résoudre les tokens Singleton
		return new RequestContext();
	});
```

Katagami applique également cette règle à l'exécution dans les scopes. Si une factory singleton tente de résoudre un token Scoped — directement ou via des intermédiaires — une `ContainerError` est levée :

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

Crée un nouveau conteneur DI. Passez une interface comme `T` pour définir la carte de types pour les tokens PropertyKey. Passez `ScopedT` pour définir une carte de types séparée pour les tokens PropertyKey Scoped (indépendant de l'ordre, comme `T`).

### `Container.prototype.registerSingleton(token, factory)`

Enregistre une factory en tant que singleton. L'instance est créée au premier `resolve` et mise en cache ensuite. Retourne le conteneur pour le chaînage de méthodes.

### `Container.prototype.registerTransient(token, factory)`

Enregistre une factory en tant que transient. Une nouvelle instance est créée à chaque `resolve`. Retourne le conteneur pour le chaînage de méthodes.

### `Container.prototype.registerScoped(token, factory)`

Enregistre une factory en tant que scoped. Au sein d'un scope, l'instance est créée au premier `resolve` et mise en cache pour ce scope. Chaque scope maintient son propre cache. Les tokens Scoped ne peuvent pas être résolus depuis le conteneur racine. Retourne le conteneur pour le chaînage de méthodes.

### `Container.prototype.use(source)`

Copie tous les enregistrements de `source` (un autre `Container`) dans ce conteneur. Seuls les entrées de factory et de cycle de vie sont copiés — les caches d'instances singleton ne sont pas partagés. Retourne le conteneur pour le chaînage de méthodes.

### `Container.prototype.resolve(token)`

Résout et retourne l'instance pour le token donné. Lève une `ContainerError` si le token n'est pas enregistré ou si une dépendance circulaire est détectée.

### `Container.prototype.tryResolve(token)`

Tente de résoudre l'instance pour le token donné. Retourne `undefined` si le token n'est pas enregistré, au lieu de lever une exception. Lève toujours une `ContainerError` pour les dépendances circulaires ou les opérations sur des conteneurs/scopes supprimés.

### `createScope(source)` — `katagami/scope`

Crée un nouveau `Scope` (conteneur enfant) à partir d'un `Container` ou d'un `Scope` existant.

### `class Scope`

Un conteneur enfant avec scope créé par `createScope()`.

### `Scope.prototype.resolve(token)`

Résout et retourne l'instance pour le token donné. Se comporte de la même manière que `Container.prototype.resolve`, mais peut également résoudre les tokens Scoped.

### `Scope.prototype.tryResolve(token)`

Tente de résoudre l'instance pour le token donné. Retourne `undefined` si le token n'est pas enregistré, au lieu de lever une exception. Lève toujours une `ContainerError` pour les dépendances circulaires ou les opérations sur des scopes supprimés.

### `lazy(source, token)` — `katagami/lazy`

Crée un Proxy qui diffère `resolve()` jusqu'au premier accès à une propriété. L'instance résolue est mise en cache — les accès suivants utilisent le cache. Seuls les tokens de classe synchrones sont supportés ; les tokens asynchrones et PropertyKey sont rejetés au niveau des types. Fonctionne avec `Container`, `Scope`, `DisposableContainer` et `DisposableScope`.

### `disposable(container)` — `katagami/disposable`

Attache `[Symbol.asyncDispose]` à un `Container` ou `Scope`, permettant la syntaxe `await using`. Supprime toutes les instances gérées dans l'ordre inverse de création (LIFO). Appelle `[Symbol.asyncDispose]()` ou `[Symbol.dispose]()` sur chaque instance qui les implémente. Idempotent — les appels suivants sont sans effet. Après la suppression, `resolve()` lèvera une `ContainerError`. Le type de retour est restreint à `DisposableContainer` ou `DisposableScope`, qui n'exposent que `resolve` et `tryResolve` — les méthodes d'enregistrement sont supprimées au niveau des types.

### `class ContainerError`

Classe d'erreur levée pour les échecs du conteneur tels que la résolution d'un token non enregistré, les dépendances circulaires ou les opérations sur un conteneur/scope supprimé.

### `type Resolver`

Export de type représentant le resolver passé aux callbacks de factory. Utile quand vous devez typer une fonction qui accepte un paramètre resolver.

## Licence

MIT
