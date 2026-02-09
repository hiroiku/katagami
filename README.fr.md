[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

Conteneur DI léger pour TypeScript avec inférence de types complète.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)
[![license](https://img.shields.io/npm/l/katagami)](https://github.com/hiroiku/katagami/blob/master/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/katagami)](https://bundlephobia.com/package/katagami)

> Le nom vient de 型紙 _(katagami)_ — un papier pochoir de précision utilisé dans la teinture traditionnelle japonaise pour transférer des motifs exacts sur le tissu. Plusieurs pochoirs sont superposés pour composer des motifs complexes, tout comme les types s'accumulent à chaque appel dans la chaîne de méthodes. Un pochoir ne nécessite que du papier et un pinceau, pas de machinerie élaborée — de même, Katagami ne requiert ni décorateurs ni mécanismes de métadonnées et fonctionne avec n'importe quel outil de build sans configuration. Et comme les pochoirs s'adaptent à différents tissus et techniques, Katagami s'adapte à TypeScript et JavaScript, aux tokens de classe et aux tokens PropertyKey — une approche hybride pour une DI stricte et composable.

## Fonctionnalités

| Fonctionnalité                        | Description                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Inférence de types complète           | Les types s'accumulent par chaînage de méthodes ; les tokens non enregistrés provoquent des erreurs à la compilation |
| Trois cycles de vie                   | Singleton, Transient et Scoped avec conteneurs enfants                                                               |
| Factories asynchrones                 | Les factories retournant des Promise sont automatiquement suivies par le système de types                            |
| Détection des dépendances circulaires | Messages d'erreur clairs avec le chemin complet du cycle                                                             |
| Support Disposable                    | TC39 Explicit Resource Management (`Symbol.dispose` / `Symbol.asyncDispose` / `await using`)                         |
| Prévention des dépendances captives   | Les factories Singleton/Transient ne peuvent pas accéder aux tokens Scoped ; détecté à la compilation                |
| Stratégie de tokens hybride           | Tokens de classe pour une sécurité de types stricte, tokens PropertyKey pour la flexibilité                          |
| Carte de types par interface          | Passez une interface à `createContainer<T>()` pour un enregistrement indépendant de l'ordre                          |
| Zéro dépendance                       | Pas de décorateurs, pas de reflect-metadata, pas de polyfills                                                        |

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

Les enregistrements Scoped se comportent comme des singletons au sein d'un scope mais produisent une instance fraîche dans chaque nouveau scope. Utilisez `createScope()` pour créer un conteneur enfant. Les tokens Scoped ne peuvent pas être résolus depuis le conteneur racine.

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

// Créer un scope pour chaque requête
const scope1 = root.createScope();
const scope2 = root.createScope();

// Scoped — identique au sein d'un scope, différent entre les scopes
scope1.resolve(RequestContext) === scope1.resolve(RequestContext); // true
scope1.resolve(RequestContext) === scope2.resolve(RequestContext); // false

// Singleton — partagé entre tous les scopes
scope1.resolve(DbPool) === scope2.resolve(DbPool); // true
```

Les scopes peuvent aussi être imbriqués. Chaque scope imbriqué possède son propre cache d'instances Scoped tout en partageant les singletons avec son parent :

```ts
const parentScope = root.createScope();
const childScope = parentScope.createScope();

// Chaque scope imbriqué obtient ses propres instances Scoped
parentScope.resolve(RequestContext) === childScope.resolve(RequestContext); // false

// Les singletons sont toujours partagés
parentScope.resolve(DbPool) === childScope.resolve(DbPool); // true
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

`Container` et `Scope` implémentent tous deux `AsyncDisposable`. Lors de la suppression, les instances gérées sont parcourues dans l'ordre inverse de création (LIFO) et leurs méthodes `[Symbol.asyncDispose]()` ou `[Symbol.dispose]()` sont appelées automatiquement.

```ts
import { createContainer } from 'katagami';

class Connection {
	async [Symbol.asyncDispose]() {
		console.log('Connection closed');
	}
}

// Suppression manuelle
const container = createContainer().registerSingleton(Connection, () => new Connection());

container.resolve(Connection);
await container[Symbol.asyncDispose]();
// => "Connection closed"
```

Avec `await using`, les scopes sont automatiquement supprimés à la fin du bloc :

```ts
const root = createContainer()
	.registerSingleton(DbPool, () => new DbPool())
	.registerScoped(Connection, () => new Connection());

{
	await using scope = root.createScope();
	const conn = scope.resolve(Connection);
	// ... utiliser conn ...
} // le scope est supprimé ici — Connection est nettoyé, DbPool ne l'est pas
```

La suppression du scope n'affecte que les instances Scoped. Les instances Singleton appartiennent au conteneur racine et sont supprimées lorsque le conteneur lui-même est supprimé.

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

## API

### `createContainer<T, ScopedT>()`

Crée un nouveau conteneur DI. Passez une interface comme `T` pour définir la carte de types pour les tokens PropertyKey. Passez `ScopedT` pour définir une carte de types séparée pour les tokens PropertyKey Scoped (indépendant de l'ordre, comme `T`).

### `container.registerSingleton(token, factory)`

Enregistre une factory en tant que singleton. L'instance est créée au premier `resolve` et mise en cache ensuite. Retourne le conteneur pour le chaînage de méthodes.

### `container.registerTransient(token, factory)`

Enregistre une factory en tant que transient. Une nouvelle instance est créée à chaque `resolve`. Retourne le conteneur pour le chaînage de méthodes.

### `container.registerScoped(token, factory)`

Enregistre une factory en tant que scoped. Au sein d'un scope, l'instance est créée au premier `resolve` et mise en cache pour ce scope. Chaque scope maintient son propre cache. Les tokens Scoped ne peuvent pas être résolus depuis le conteneur racine. Retourne le conteneur pour le chaînage de méthodes.

### `container.resolve(token)`

Résout et retourne l'instance pour le token donné. Lève une `ContainerError` si le token n'est pas enregistré ou si une dépendance circulaire est détectée.

### `container.createScope()`

Crée un nouveau `Scope` (conteneur enfant). Le scope hérite de tous les enregistrements du parent. Les instances Singleton sont partagées avec le parent, tandis que les instances Scoped sont locales au scope.

### `Scope`

Un conteneur enfant avec scope créé par `createScope()`. Fournit `resolve(token)`, `createScope()` (pour les scopes imbriqués) et `[Symbol.asyncDispose]()`.

### `container[Symbol.asyncDispose]()` / `scope[Symbol.asyncDispose]()`

Supprime toutes les instances gérées dans l'ordre inverse de création (LIFO). Appelle `[Symbol.asyncDispose]()` ou `[Symbol.dispose]()` sur chaque instance qui les implémente. Idempotent — les appels suivants sont sans effet. Après la suppression, `resolve()` et `createScope()` lèveront une `ContainerError`.

### `ContainerError`

Classe d'erreur levée pour les échecs du conteneur tels que la résolution d'un token non enregistré, les dépendances circulaires ou les opérations sur un conteneur/scope supprimé.

### `Resolver`

Export de type représentant le resolver passé aux callbacks de factory. Utile quand vous devez typer une fonction qui accepte un paramètre resolver.

## Licence

MIT
