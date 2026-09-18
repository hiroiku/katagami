# Changelog

## 4.0.0

Add registration policies, typed registration metadata and public operations. Factory resolvers now
keep their lifetime checks after `await`, which changes some runtime behavior; review the breaking
changes before upgrading.

Breaking changes:

- Pass factories a resolver bound to the requesting registration instead of the scope itself. It exposes
  only `resolve`, `tryResolve`, `resolveAll` and `tryResolveAll`.
- Keep the singleton restriction on that resolver after the factory returns. A resolver stored by a
  singleton factory, or by a factory resolved while building a singleton, and a `lazy()` view created from
  such a resolver, now throw a captive-dependency `ContainerError` when they resolve a scoped token later.
- Return Katagami's own Promise when a factory returns a native Promise, including async factories,
  instead of the Promise the factory returned. Its identity and custom properties are not preserved.
  Without a `beforeReturn` policy, repeated resolutions of a cached result still return the same Promise.
- Detect cycles along each resolution chain, including while an async creation is pending. The factories
  still building a pending creation, through their resolvers or by calling the same scope synchronously,
  can no longer resolve its token again, even without waiting for it: this throws a circular-dependency
  `ContainerError`. In 3.x it recursed without end, rejected with a `TypeError`, never settled or returned
  the pending Promise, depending on the lifetime and on whether it was awaited. A resolver kept by a
  dependency that has finished building still returns the pending Promise to later callers; a creation
  that waits for its own Promise that way never settles, as in 3.x. Synchronous cycles are reported
  whichever resolver or scope they pass through.
- Skip a cached async creation that rejected when disposing, instead of reporting it in the disposal
  `AggregateError`. The failure stays with the caller that resolved the token.
- Throw `ContainerError` when registering on, or composing into, a disposed container.
- Use new shared runtime keys. Containers, scopes and disposable views from 3.x cannot be mixed with 4.x
  in the same process.
- Require TypeScript 5.0 or later: the published declarations use `const` type parameters.

Additions:

- Share a `policy` object across modules with `createContainer({ policy })`: `requiredMetadata` is checked
  at compile time and at runtime, including `.use()`, and modules with a different policy are rejected.
- Define typed metadata keys with `createMetadataKey`, attach them through the `{ metadata }` registration
  option and read them with `container.getMetadata(token)`.
- Mark function-valued factories with `entrypoint()` and call them through
  `createScope(container, { access: 'operations' })`. Operations resolve on each call, always return a
  Promise, and are awaited by disposal. Unknown `access` values are rejected.
- Check each resolution synchronously with the `beforeResolve` scope option, which receives the
  requesting registration and the resolution path.
- Check values leaving top-level resolution and operation results with `policy.beforeReturn`, using the
  registrations each value was observed through. The records keep neither containers nor factories alive.
- Export `RegisteredTokens` and the policy, metadata, resolution-event and operations-scope types, so
  consumers can emit declarations for code that builds operations scopes.
- Give the new type parameters defaults; the 3.0.3 documentation examples and type tests compile unchanged.

## 3.0.3

- Expand the English and Japanese README comparison to 27 features across eight libraries, retaining all 18 original comparison aspects.
- Restore feature rows, library columns and status icons, with Katagami's advantages emphasized and detailed conditions in expandable notes.
- Document the sources and distinctions for the additional comparison rows, and align localized version labels.
- Keep runtime code and public APIs unchanged from 3.0.2.

## 3.0.2

- Restore the README comparison with InversifyJS, tsyringe, TypeDI, Awilix, NestJS, Effect and typed-inject.
- Review stable package versions and official sources on 2026-09-11; distinguish registration checks, scope policies, async services and cleanup.
- Restore Katagami's advantages and localized comparison summaries, with linked sources and precise feature notes.
- Keep runtime code and public APIs unchanged from 3.0.1.

## 3.0.1

- Preserve accumulated token maps, class tokens and async types when creating scopes from disposable views.
- Distinguish disposable container and scope views during type inference, including nested scopes.
- Run the existing type tests and new guarantee regressions in CI; verify published declarations without Bun types.
- Move `@types/bun` to development dependencies so consumers install no runtime dependencies.
- Add checked README examples, AI coding guidance, type-safety documentation and a request-scope starter.
- Refresh localized onboarding, package discovery metadata and the DI decision guide.
- Check ESM/CommonJS imports and the starter against an offline installation of the npm tarball.
- Build with esbuild to preserve barrel exports with a side-effect-free manifest.
- Share the internal protocol key across CommonJS entry points and mixed ESM/CommonJS imports.
- Publish separate import/require declarations with explicit module extensions for NodeNext consumers.
- Track the dependency lockfile and explicitly dispatch publishing after an automated release.

## 3.0.0

Separate registration (`Container`) from resolution (`Scope`). Create a scope with
`createScope(container)` before resolving services.
