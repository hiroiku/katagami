[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**Injection de dépendances avec sûreté des types pour TypeScript.**

Rendez les dépendances explicites et vérifiables, même quand des agents de programmation IA écrivent le code. Katagami accumule les types à chaque enregistrement, vérifie les jetons accessibles aux fabriques et suit les retours asynchrones. Sans décorateurs, reflect-metadata ni dépendances à l’exécution.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## Démarrage rapide

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## Pourquoi choisir Katagami ? Comparaison

Katagami associe **types déduits des enregistrements, restrictions de portée à la compilation et aucune dépendance d'exécution** dans des fabriques TypeScript ordinaires. Aucun décorateur ni métadonnée n'est nécessaire. La libération des ressources et la résolution différée ont des points d'entrée distincts.

**Vérifié le 2026-09-11**, à partir des versions stables npm et des sources officielles. Consultez les [versions et sources](./choosing-di.md#comparison-sources) et le [comparatif complet sur l'asynchronisme et la libération des ressources](../README.md#library-comparison).

| Bibliothèque / version | Types et vérification des enregistrements | Politique de portée |
| --- | --- | --- |
| **Katagami 3.0.2** | **Accumule les tokens littéraux/unique symbol ; rejette les tokens requis non enregistrés** | **Exclut les tokens Scoped du résolveur des fabriques Singleton/Transient** |
| InversifyJS 8.2.3 | Bindings typés ; existence vérifiée à l'exécution | Durée de vie configurée par binding |
| tsyringe 4.10.0 | Types de classe/génériques ; enregistrements vérifiés à l'exécution | Durées de vie et conteneurs enfants |
| TypeDI 0.10.0 | Classes et `Token<T>` ; enregistrements vérifiés à l'exécution | Services partagés/Transient, conteneurs nommés |
| Awilix 13.0.5 | Cradle déduit des enregistrements ; `resolve` accepte aussi des noms inconnus | `strict: true` vérifie les fuites de durée de vie à l'exécution |
| NestJS 12.0.1 | Providers typés ; graphe résolu à l'exécution | La portée Request se propage aux providers dépendants |
| Effect 3.22.2 | Services requis suivis dans les types `Effect`/`Layer` | `Scope` typé et finaliseurs |
| typed-inject 5.0.0 | Tokens chaînes accumulés et tuples `inject` vérifiés | Singleton, Transient, injecteurs enfants |

Awilix, Effect et typed-inject proposent aussi des vérifications de types. Katagami associe celles des enregistrements et des portées avec des appels directs à `r.resolve(token)`. Les [limites des tokens, classes et références mutables](./type-safety.md) s'appliquent.

## Travailler avec des agents de programmation IA

L’agent modifie les dépendances, exécute le vérificateur TypeScript, puis corrige le code à partir des diagnostics. Les fabriques explicites rendent les dépendances visibles dans du code TypeScript ordinaire.

Par exemple, accéder à un état Scoped depuis une fabrique Singleton produit une erreur de type.

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

Dans cet exemple, enregistrez handler avec registerScoped. @ts-expect-error sert à vérifier l’exemple incorrect en CI. Dans l’application, corrigez la durée de vie et lancez npx tsc --noEmit sans masquer l’erreur.

## Types accumulés et garanties

createContainer() accumule les types des enregistrements. En conservant les clés littérales et les types unique symbol, les jetons absents de l’ensemble visible sont rejetés. Aucune table manuelle des types de services n’est nécessaire.

Les jetons de classe suivent le typage structurel : une autre classe compatible peut être acceptée. Une clé déclarée dans createContainer<Services>() peut aussi être visible dans les types sans enregistrement réel.

Prend en charge Singleton, Transient et Scoped, la composition avec use(), les fabriques asynchrones, la résolution optionnelle et multiple, la libération des ressources et la résolution différée. Pour peu de dépendances, des paramètres ordinaires peuvent suffire.

## Guides et exemple exécutable

- [Guide pour agents IA (anglais)](./ai-coding-agents.md)
- [Garanties de types (anglais)](./type-safety.md)
- [Guide et API (anglais)](./guide.md)
- [Exemple de portée par requête (anglais)](../examples/request-scope/README.md)
- [Choisir une approche DI (anglais)](./choosing-di.md)

Les exemples de types et les tests d’exécution sont vérifiés en CI. Les gains de réussite des agents ou de consommation de tokens n’ont pas encore été mesurés.

Le nom vient de 型紙, les pochoirs de papier de la teinture traditionnelle japonaise. Les types s’accumulent comme des couches de pochoirs.

MIT
