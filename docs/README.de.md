[English](../README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [繁體中文](./README.zh-TW.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md)

# Katagami

**Typsichere Dependency Injection für TypeScript.**

Mache Abhängigkeiten explizit und prüfbar, auch wenn KI-Coding-Agenten den Code schreiben. Katagami sammelt Typen mit jeder Registrierung, prüft die in einer Factory verfügbaren Tokens und verfolgt asynchrone Rückgaben. Ohne Decorators, reflect-metadata oder Laufzeitabhängigkeiten.

[![npm version](https://img.shields.io/npm/v/katagami)](https://www.npmjs.com/package/katagami)

```sh
npm install katagami
```

## Schnellstart

```ts
import { createContainer, createScope } from 'katagami';

const container = createContainer()
  .registerSingleton('name', () => 'Ada')
  .registerScoped('greeting', r => `Hello, ${r.resolve('name')}!`);

const greeting: string = createScope(container).resolve('greeting');
console.log(greeting);
```

## Warum Katagami? Bibliotheksvergleich

Katagami verbindet **aus Registrierungen abgeleitete Typen, Scope-Prüfungen zur Compile-Zeit und keine Laufzeitabhängigkeiten** mit gewöhnlichen TypeScript-Factories. Decorators und Metadaten sind nicht nötig. Ressourcenfreigabe und Lazy Resolution haben eigene Einstiegspunkte.

**Geprüft am 2026-09-11**, anhand stabiler npm-Versionen und offizieller Quellen. Die Katagami-Angaben beschreiben diese Version (4.0.0). Siehe [Versionen und Quellen](./choosing-di.md#comparison-sources) sowie den [vollständigen Vergleich mit Async-Verhalten und Ressourcenfreigabe](../README.md#library-comparison).

| Bibliothek / Version | Abhängigkeitstypen und Registrierungsprüfung | Scope-Verhalten |
| --- | --- | --- |
| **Katagami 4.0.0** | **Sammelt Literal-/unique-symbol-Tokens; fehlende erforderliche Tokens sind Typfehler** | **Scoped-Tokens im Resolver von Singleton-/Transient-Factories ausgeschlossen** |
| InversifyJS 8.2.3 | Typisierte Bindings; Existenzprüfung zur Laufzeit | Konfigurierte Binding-Lebensdauer |
| tsyringe 4.10.0 | Klassen-/generische Typen; Registrierungsprüfung zur Laufzeit | Lebensdauer und Kindcontainer |
| TypeDI 0.10.0 | Klassen und `Token<T>`; Registrierungsprüfung zur Laufzeit | Geteilte/Transient-Services, benannte Container |
| Awilix 13.0.5 | Abgeleitete Cradle-Typen; breites `resolve` akzeptiert unbekannte Namen | Laufzeitprüfung von Lebensdauern mit `strict: true` |
| NestJS 12.0.1 | Typisierte Provider; Abhängigkeitsgraph zur Laufzeit | Request-Scope überträgt sich auf abhängige Provider |
| Effect 3.22.2 | Service-Anforderungen in `Effect`-/`Layer`-Typen | Typisierter `Scope` und Finalizer |
| typed-inject 5.0.0 | Gesammelte String-Tokens, geprüfte `inject`-Tupel | Singleton, Transient, Kindinjectoren |

Auch Awilix, Effect und typed-inject bieten Typprüfungen. Katagami kombiniert Registrierungs- und Scope-Prüfungen mit direkten `r.resolve(token)`-Aufrufen. Die [Grenzen für Tokentypen, Klassen und veränderliche Referenzen](./type-safety.md) gelten weiterhin.

## Mit KI-Coding-Agenten arbeiten

Der Agent ändert die Abhängigkeiten, führt den TypeScript-Checker aus und korrigiert den Code anhand der Diagnosen. Explizite Factories zeigen Abhängigkeiten als gewöhnlichen TypeScript-Code.

Wenn eine Singleton-Factory auf Scoped-Zustand einer Anfrage zugreift, entsteht beispielsweise ein Typfehler.

```ts
import { createContainer } from 'katagami';

createContainer()
  .registerScoped('request', () => ({ id: crypto.randomUUID() }))
  // @ts-expect-error — singleton factories cannot access scoped tokens
  .registerSingleton('handler', r => r.resolve('request'));
```

Registriere handler in diesem Beispiel mit registerScoped. @ts-expect-error prüft das fehlerhafte Beispiel in CI. Korrigiere im Anwendungscode die Lebensdauer und führe npx tsc --noEmit aus, statt den Fehler zu unterdrücken.

## Gesammelte Typen und Garantien

createContainer() sammelt Typen aus Registrierungen. Solange Literalschlüssel und unique-symbol-Typen erhalten bleiben, werden Tokens außerhalb der sichtbaren Registrierungen abgelehnt. Eine manuelle Service-Typzuordnung ist nicht nötig.

Klassentokens folgen struktureller Typisierung: Eine andere kompatible Klasse kann akzeptiert werden. Ein in createContainer<Services>() deklarierter Schlüssel ist ebenfalls im Typ sichtbar, auch ohne tatsächliche Registrierung.

Unterstützt Singleton, Transient und Scoped, Modulkomposition mit use(), asynchrone Factories, optionale und mehrfache Auflösung, Ressourcenfreigabe und verzögerte Auflösung. Bei wenigen Abhängigkeiten reichen oft normale Parameter.

## Anleitungen und ausführbares Beispiel

- [Anleitung für KI-Agenten (Englisch)](./ai-coding-agents.md)
- [Typgarantien (Englisch)](./type-safety.md)
- [API und Anwendung (Englisch)](./guide.md)
- [Registrierungsrichtlinien und Operationen (Englisch)](./registration-policies.md)
- [Starter für Anfrage-Scopes (Englisch)](../examples/request-scope/README.md)
- [DI auswählen (Englisch)](./choosing-di.md)

CI prüft Typbeispiele und Laufzeittests. Verbesserungen der Reparaturquote von Agenten oder Token-Einsparungen wurden noch nicht gemessen.

Der Name stammt von 型紙, den Papierschablonen der traditionellen japanischen Färberei. Typen sammeln sich wie übereinandergelegte Schablonen.

MIT
