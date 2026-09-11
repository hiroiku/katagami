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
