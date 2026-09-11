# TypeScript request scopes without decorators

A small starter for an HTTP handler, CLI, or worker: inject a user repository,
create isolated state for each request, and dispose that state after success or failure.
It uses Katagami's accumulated literal tokens; no token-to-type interface is needed.

Copy `app.ts`, `demo.ts`, and `tsconfig.json` into a new directory, then run:

```sh
npm init -y
npm pkg set type=module
npm install katagami
npm install --save-dev typescript
npx tsc --noEmit
npx tsc
node build/demo.js
```

The demo prints a greeting for Ada and a guest greeting with different request IDs.
The example is checked on Node.js 22 and 24 in CI and runs on Bun as well.
It relies on `crypto.randomUUID`, `Symbol.dispose`, and `Symbol.asyncDispose` in the host.
TypeScript compiles `await using`; Katagami does not install polyfills.

From this repository, run `bun run build`, then `bun examples/request-scope/demo.ts`.
`bun run test:examples` checks concurrency, fake injection and cleanup on rejection.
`bun run test:package` also compiles and runs this starter against the packed npm artifact in Node.js.

For an HTTP application, call the returned `greet` function inside the request handler.
Create the application once, outside the handler. Each call creates and disposes its own scope.
Pass authentication context explicitly into the application when adding authentication;
this example does not provide an authentication or authorization system.

Try changing `registerScoped('greeting', ...)` to `registerSingleton('greeting', ...)`.
`npx tsc --noEmit` will reject `r.resolve('request')`. Restore the scoped registration:
the greeting captures request state, so it must share that request's lifetime.

See the [AI coding guide](../../docs/ai-coding-agents.md) and [type guarantees](../../docs/type-safety.md).
