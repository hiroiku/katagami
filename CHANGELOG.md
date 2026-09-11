# Changelog

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
