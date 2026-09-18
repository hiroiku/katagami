# Registration policies and operations

Japanese: [登録の属性と公開操作](./registration-policies.ja.md)

You can attach metadata to registrations and derive resolution-time checks and public operations from
those same registrations. Define the shared policy once as `policy` and pass the same object reference
to each module. You do not need to maintain a separate list of target tokens. What the metadata means,
and what to allow or deny, is decided by your code.

The plain `createContainer()` and `createScope(container)` keep working as they are. The policies and
operations described here are features you add when you need them.

## Assemble modules with one policy

```ts
import { createContainer, createMetadataKey, createScope, entrypoint } from 'katagami';
import type { ContainerPolicy } from 'katagami';

const EXPOSURE = createMetadataKey<'internal' | 'public'>()('exposure');
const policy = {
  name: 'reports',
  requiredMetadata: [EXPOSURE] as const,
  beforeReturn({ registrations }) {
    if (registrations.some(registration =>
      registration.metadata.require(EXPOSURE) === 'internal'
    )) {
      throw new Error('Internal dependency instances cannot be exposed');
    }
  },
} satisfies ContainerPolicy;

function createReports(options: { policy: typeof policy }) {
  return createContainer({ policy: options.policy })
    .registerSingleton('repository', () => ({
      read: (id: string) => `report:${id}`,
    }), {
      metadata: [EXPOSURE('internal')],
    })
    .registerScoped('readReport', entrypoint(resolver => {
      const repository = resolver.resolve('repository');
      return (id: string) => ({ id, title: repository.read(id) });
    }), {
      metadata: [EXPOSURE('public')],
    });
}

const container = createContainer({ policy }).use(createReports({ policy }));
await using operations = createScope(container, { access: 'operations' });
const readReport = operations.get('readReport');
const report = await readReport('42');
```

`entrypoint(factory)` marks a factory that returns a function to expose. In the example above, only
`readReport` can be invoked. The resolver used to resolve `repository` stays inside the factory, and
callers pass ordinary arguments. The operation produces the result; `policy` does not transform it.

`ContainerPolicy` is a public type for use with `satisfies`. It types the hook arguments while keeping
the concrete keys of `requiredMetadata: [EXPOSURE] as const`. If you widen the type with
`const policy: ContainerPolicy` or `as ContainerPolicy`, individual required keys can no longer be
type-checked.

Pass the original `policy` reference to modules. Rebuilding the outer `{ policy }` argument still keeps
the policy shared, but copying the policy itself with `{ ...policy }` creates a different policy. The
module in this example supports policies it can satisfy by attaching `EXPOSURE`; it makes no promise to
support policies with arbitrary required metadata.

A runnable example in the repository is
[examples/registration-policies.ts](https://github.com/hiroiku/katagami/blob/master/examples/registration-policies.ts).
After building, run it with `bun examples/registration-policies.ts`.

## Metadata and required keys

`createMetadataKey<T>()('name')` separates specifying the value type from inferring the key name. The
name can be a string literal or a unique symbol. A key with a different name does not satisfy a
required key, even if its value type is the same. Separately created keys with the same name cannot be
told apart by type alone, so the runtime check uses the identity of the key object. Share key
definitions as well.

Setting `policy.requiredMetadata` requires each registration's `metadata` to include the required keys.
Missing keys are checked both by type and at runtime, at registration and on `.use()`. Older
registrations for the same token are still resolved by `resolveAll`, so they are not exempt from the
check. The runtime check is not skipped even when the type has lost the registration history. Duplicate
or invalid entries are also rejected, and you can register additional metadata that is not required.

`container.getMetadata(token)` returns only the metadata of the last registration and does not run the
factory. An unregistered token throws `ContainerError`. The reader has the following methods.

| Method | Result |
| --- | --- |
| `get(key)` | The metadata value, or `undefined` if not set |
| `require(key)` | The metadata value; throws if not set |
| `has(key)` | Whether the metadata exists |

Readers and entries are read-only, but objects you pass as metadata values are not frozen internally.

### Conditions for `.use()`

| Source module | Target container | Behavior |
| --- | --- | --- |
| No policy | No policy | Ordinary composition |
| No policy | Has a policy | Checks every registration for the target's required metadata, then composes |
| Same policy | Same policy | Checks every registration, then composes |
| Different policy | Has a policy | Rejected |
| Has a policy | No policy | Rejected |

A rejected `.use()` never applies only some of the registrations. Composition copies registration
definitions; it does not merge the module's cache into the target. If you create each module with
`createContainer({ policy })`, missing metadata is also detected when the module registers.

## Policy identity and fixed settings

Containers that use a `policy` with the same original object reference share its settings and the
record of instance origins. A different object with the same `name` is a different policy. `name` is
a label for telling policies apart in your own code; katagami does not include it in errors or events,
and never uses it as a key for sharing or authorization. Containers without an explicit
policy get no implicit shared return check.

On first use, katagami validates the settings, copies the array of required keys and fixes its internal
settings. Hooks are also taken as the function references at that moment. Katagami neither modifies nor
freezes your `policy` object or its arrays, so `Object.freeze` is unnecessary. `as const` and
`satisfies` do not freeze anything at runtime either.

Changing the original definition after first use does not affect existing containers. Passing the same,
modified object to `createContainer({ policy })` again is rejected. To change `name`, the order or
references of the required keys, or the hook references, prepare a new policy object.

Use data properties for settings. Accessors are rejected without running their getters. Detecting that
an object is a Proxy is not guaranteed.

Katagami does not fix the state that hook closures refer to, or the internals of metadata values. Keep
per-request authorization state out of the shared policy and pass it to the scope's `beforeResolve`
instead. Even with the same policy, separate roots do not share singleton caches, request state or
resource ownership.

## Instance origins and return checks

### Recording resolved references

For each object or function actually resolved within one policy, katagami records the reference and the
details of its registration at that time (token, lifetime, whether it is an `entrypoint`, and metadata).
Primitives such as strings, numbers and symbols are not tracked, even when the values are equal.

- Resolving the same instance under another token adds an origin. Existing origins are not removed.
- Overriding a token keeps the old origins of instances already created.
- Origins whose registration details are all identical are merged into one, even across different
  registrations or containers. Even if you rebuild the container for every request, the record for one
  instance grows no larger than the number of origins `beforeReturn` can tell apart. Metadata is
  compared regardless of order, by key reference and value identity (`Object.is`). If you use values
  that change per request, such as a request ID, or objects created anew for each request, as metadata
  values or tokens, each request counts as a separate origin and the record grows by that many.
- A new instance does not inherit the origins of an old one.
- For an `async` factory or a factory that returns a native `Promise`, katagami builds a chain that awaits
  completion and records the fulfilled value inside it. Callers receive the end of this chain, not the
  promise the factory returned. Custom properties attached to that promise are not carried over, so if
  you want to hand out an object as the value, make it a non-Promise instance or a custom thenable. The
  cache also holds this chain end, and resolving again in the same scope returns the same promise. A
  top-level resolution under a policy with a return check returns a promise per call, as described below.
- Records are shared across caches, every lifetime, parent/child and sibling scopes, and separate roots
  that use the same policy. Records of different policies never mix.

A custom thenable (a user-defined object with `then`) returned by a synchronous factory is recorded by
reference as an ordinary dependency instance. Katagami keeps the original instance, cache and custom
methods, does not touch `then` or its getter, and does not subscribe to its completion. It does not
automatically record an origin for its completion value. If you want the completion value treated as a
registered dependency, make that explicit with an ordinary async factory, such as
`async () => await thenable`.

To create an alias, `resolve` the original token inside an ordinary factory. The original origin is then
observed as well. Katagami does not guess origins for factories that have not run, or for references
brought in without going through a registration. Nor does it replace old origins with the current
`getMetadata(token)`.

Records are held through weak references so they do not keep instances alive unnecessarily, and they are
not cleared when a scope ends. A record holds only the origin details (token, lifetime, whether it is an
`entrypoint`, and metadata keys and values). It holds no registrations, factories or their closures,
caches, scopes or containers, so even when an instance or the policy outlives the container, none of
these outlive the container. However, if a token or a metadata value itself references the container,
the container stays alive through the record. Settings and records are also shared between the ESM and
CJS builds of the same package when they receive the same policy reference. This is not guaranteed
across different versions or realms.

### Promises you receive are left untouched

For its bookkeeping and disposal, katagami never attaches `then` / `catch` / `finally` to a promise it has
handed to a caller. It does its bookkeeping inside a chain of its own and hands out the end of that chain. The creation results that
disposal uses to know what to close, and the completion notices that closing uses to wait for running
operations, are also kept by katagami itself, separately from the promises it hands out.

As a result, if you drop a promise you received and it fails, the failure surfaces as an unhandled
rejection, as the runtime does by default. Even when scope disposal or the closing of an operations
scope overlaps, katagami never takes over that failure before you do. Always receive the return value of
`resolve` and the promise an operation returns, and either `await` it or handle it with `catch`.

A promise that a singleton or scoped creation put in the cache is shared with later resolutions,
though. A top-level resolution under a policy with a return check, and a call through an operations
scope, build their own promise from the shared one and wait on it. From then on, the failure of the
shared promise is handled and reaches that later caller, even if an earlier caller dropped the same
promise, just as when another caller `await`s the same cached promise.

Failures of creations that could not be handed to a caller are not hidden either. If another
registration fails synchronously partway through `resolveAll`, failures of asynchronous creations that
had already started surface as unhandled rejections. Singleton and scoped creations remain in the cache,
so resolving the same token again gives you the same failure. Transient registrations run the factory
again on every resolution, so the original failure cannot be recovered.

### What `beforeReturn` covers

`beforeReturn({ registrations })` is a synchronous check that keeps values the policy forbids from
leaving through any surface. It covers the following two surfaces, and both look only at observed
origins.

| Surface | Values checked |
| --- | --- |
| Ordinary resolver scope | Values returned by top-level resolution with `resolve`, `resolveAll`, `tryResolve` and `tryResolveAll` |
| Operations scope | Fulfillment values returned directly by public operations |

Resolutions requested by a factory (those that carry a `requester` in `beforeResolve`) are inside the
surface, so they are not checked. Factories are free to receive the dependencies they need for assembly,
and the policy decides only what goes out. The path by which an operations scope resolves the invoking
function of a public operation is also inside the surface. To `beforeResolve`, this internal resolution
looks the same as a top-level one, with no `requester`, so you cannot tell inside from outside the
surface by `beforeResolve`'s `requester` alone. An optional resolution of an unregistered token produces
no value, so it returns `undefined` without a check. `lazy` calls `resolve` on the first property
access, so the check happens at that point.

Origins are tracked only for objects and functions. A primitive result is checked with empty
`registrations`, so if a registration tagged with `area` returns a string or number, a decision based
on origins does not stop it. If you pass a factory's resolver itself out through an operation result or a
closure, resolutions through that resolver are treated as inside the surface and are not checked.
Register things in a way that keeps the resolver from leaving. A factory that synchronously calls the
public methods of the scope building it resolves inside its own construction as well: lifetime and cycle
checks apply, and the return check does not.

A synchronous factory's value is checked on the spot; for an asynchronous factory, the resolved value is
checked before it is handed to the caller. With a policy that has a return check, each top-level
asynchronous resolution is checked per call, so every call returns its own promise for the same
creation. For an operation that returns a promise or thenable, the result is `await`ed and only the
known origins of the fulfillment value are checked. The origin of a custom thenable itself is not
assumed to carry over to its completion value. `registrations` is a read-only snapshot of the origins
observed for the result reference. The operation's own registration is never passed in place of the
result's origins. For primitives and results of unknown origin, it is an empty array.

To allow, return nothing; to deny, throw. Async hooks cannot be used, and the hook cannot transform the
return value. The value is not handed to the caller until the check completes. On denial, a synchronous
resolution throws, and an asynchronous resolution or an operation rejects its promise. The caller
receives the error the hook threw, with its `cause` intact.

In the opening example, the return is denied if any observed origin is `internal`. Katagami does not
define what that classification means or which value takes precedence.

The check is not recursive. It does not inspect nested values such as `{ repository }`, the inside of a
`Result`, exceptions or their `cause`, closures, or values a stream emits later. The reason an operation
rejects with is also out of scope. It is neither a mechanism for detecting arbitrary information leaks
nor a JavaScript security sandbox.

## Getting and invoking operations

```ts
import { createContainer, createScope, entrypoint } from 'katagami';

const container = createContainer()
  .registerScoped('repository', () => ({ read: (id: string) => `report:${id}` }))
  .registerScoped('readReport', entrypoint(resolver => {
    const repository = resolver.resolve('repository');
    return (id: string, prefix = '', ...labels: string[]) =>
      `${prefix}${repository.read(id)}${labels.join(',')}`;
  }));

await using operations = createScope(container, { access: 'operations' });
const readReport = operations.get('readReport');
const report: string = await readReport('42', 'Report: ', 'draft');
// @ts-expect-error — a non-public registration cannot be retrieved as an operation; wrap its factory in entrypoint() to expose it
operations.get('repository');
```

`createScope(container, { access: 'operations' })` always creates a new scope, and its public surface is
only `get` and `Symbol.asyncDispose`. Passing an ordinary resolver scope or a disposable scope as the
source also creates a new child scope. It is not an API that turns the source into a view with the same
scoped cache and lifetime.

`get(name)` synchronously checks that the token is public and returns an invoking function bound to the
scope. **Getting the function does not create any dependency.** It returns neither the raw registered
function, nor a resolver, nor the registration map. On invocation, it checks whether the scope is
closing, re-checks the public registration, resolves normally, runs the operation and applies the
return check, in that order.

If `.use()` or an additional registration makes the last registration non-public, calls through
previously obtained functions are rejected too. The authorization result at retrieval time is not
remembered to skip the resolution checks at call time. `beforeResolve` runs even when the value comes
from the cache.

`entrypoint` supports singleton, transient and scoped registrations, and async factories. It does not
automatically expose every method of a class. For a method that needs `this`, `bind` it to the owning
instance inside the factory. Make operations that use request state scoped.

Invocations always return a promise, even for synchronous operations. Fixed, optional and rest
parameters and the result type are inferred from the registration. For overloads, the last signature is
used; not every signature is kept. Generic functions also lose the correspondence between input and
output types. Expose such functions wrapped in a function with concrete parameter and result types.

You can pass just the operation functions you need to other code, but they cannot be used beyond the
lifetime of the scope they were obtained from. The ordinary resolver `createScope(container)` and its
`resolve` and other methods remain as they are. The `entrypoint`-only exposure restriction belongs to the
operations scope surface alone and does not apply to paths that pass an ordinary resolver. `beforeReturn`
applies to the "outside" of each surface; for an ordinary resolver scope, that is top-level resolution.

## Closing and long-running work

With `await using operations = createScope(container, { access: 'operations' })`, leaving the block
waits for the scope to close.

Once closing starts, new invocations are rejected, including those through functions already obtained.
Invocations that started before closing are awaited to completion, including internal resolution after
`await` and `beforeReturn`; whether they succeed or fail, the scope is disposed only after the result has
reached the invocation's promise. Duplicate close requests join the same closing process. Singletons
remain owned by the original container and are not disposed when an operations scope closes.

Disposal is responsible only for closing instances that were successfully created. A registration whose
async factory rejected yields nothing to close, so closing awaits it, skips it, continues disposing the
remaining instances, and does not include it in the `AggregateError`. The creation failure is received by
the caller that resolved the token (the return value of `resolve`, or the promise an operation returns).
This way, business or authorization failures and resources that genuinely could not be disposed are each
reported once, through their own promise. A failure you drop without receiving surfaces as is, as an
unhandled rejection in the runtime.

If an operation's promise returns a stream or async iterator, the invocation completes when that value
is returned. Consumption, completion and cancellation of the stream are not tracked automatically. If
consumption or cleanup needs scoped resources, keep the `await using` block open until it completes.
Also complete notifications, job records, lease releases and the like within the lifetime they need.

When authorization state changes, do not rewrite the state of a running scope; switch to a new
operations scope with the new fixed state. Start closing the old scope to stop new invocations, and wait
for the work already started and for closing to finish. Functions already obtained belong to the old
scope and are not automatically rebound to the new one.

## What resolution hooks cover

```ts
import { createContainer, createMetadataKey, createScope, entrypoint } from 'katagami';
import type { ContainerPolicy, OperationsScopeOptions } from 'katagami';

const AREA = createMetadataKey<'reports' | 'settings'>()('area');
const policy = {
  name: 'application',
  requiredMetadata: [AREA] as const,
} satisfies ContainerPolicy;
const container = createContainer({ policy })
  .registerScoped('countReports', entrypoint(() => () => 3), {
    metadata: [AREA('reports')],
  });

const allowedAreas = new Set(['reports']);
const options = {
  access: 'operations',
  beforeResolve(event) {
    if (!allowedAreas.has(event.metadata.require(AREA))) {
      throw new Error('This dependency is not available');
    }
  },
} satisfies OperationsScopeOptions;
await using operations = createScope(container, options);
const count = await operations.get('countReports')();
```

When you store the options in a variable, `satisfies OperationsScopeOptions` keeps the type of `access`
as `'operations'` and types the hook arguments too. An object whose `access` has widened to `string`, or
a misspelled `access`, cannot be passed to `createScope`. Even if you pass it with the types stripped,
any `access` other than omitted or `'operations'` is rejected at runtime with `ContainerError`; it is
never created as an ordinary scope.

In this example, `allowedAreas` holds authorization that your code settled in advance, and it does not
change during the scope's lifetime. Katagami does not make business authorization decisions.

`beforeResolve` is a synchronous function. To deny, throw; to allow, return nothing. Async hooks are
rejected. It is also available on ordinary resolver scopes.

It covers registered dependencies for `resolve`, `resolveAll`, `tryResolve` and `tryResolveAll`, and it
also runs before a cached value is returned. Optional resolution of an unknown token returns `undefined`,
as before. Child scopes inherit the parent's policy, and additional hooks cannot remove the parent's
checks.

The event has `token`, `lifetime`, `metadata`, `entrypoint`, `requester` and `path`. A factory's resolver
keeps its owning scope and requester, and they stay the same after `await`. Dependencies held by cached
instances, and method calls on an already resolved `lazy`, cause no new resolution, so the hook does not
re-check the past dependency graph every time.

### Singletons and policy ownership

When a singleton factory keeps its resolver in a closure, that resolver stays bound to the scope that
created the singleton. Even if you obtain and call the singleton from another scope, subsequent `resolve`
calls use the creating scope's hooks. Once the creating scope is closed, that resolver cannot be used. It
is not rebound to the calling scope.

Even when a resolver kept by a singleton factory obtains a scoped dependency later, in a callback or after
`await`, it is rejected as a captive dependency. Make request-dependent callbacks scoped, or inject
dependencies with an appropriate lifetime at creation time. Make only request-independent shared
infrastructure singleton.

## Preserve type information

Let the registration chain and the return value of `.use()` be inferred.
`RegisteredTokens<typeof container>` gets the types of the tokens the registration chain tracked as
registered. A container created from a predeclared type map is tracked only from its first registration
with metadata or an `entrypoint`; before that, and without such a registration, the result is `never`. A predeclared
service type is not proof that a token is registered.

Assigning to an existing `Container<T>` annotation keeps the ordinary resolver types but erases the
registration history. Erased history is never used as grounds for required metadata or public
operations. Public operations added explicitly afterwards are inferred. If you need the required
metadata guarantee of `.use()`, keep the inference from `createContainer({ policy })`.

When you combine a predeclared service type with a policy, specify the type arguments as follows,
because of TypeScript's limits on partial type argument inference. You do not need to list the required
keys again in the type arguments.

```ts
import { createContainer, createMetadataKey } from 'katagami';
import type { ContainerPolicy } from 'katagami';

const AREA = createMetadataKey<string>()('area');
const policy = {
  name: 'clock',
  requiredMetadata: [AREA] as const,
} satisfies ContainerPolicy;
interface Dependencies { clock: () => number }
const container = createContainer<Dependencies, Record<never, never>, typeof policy>({ policy })
  .registerSingleton('clock', () => Date.now, { metadata: [AREA('core')] })
  .registerScoped('now', resolver => resolver.resolve('clock')(), {
    metadata: [AREA('core')],
  });
```

Types cannot fully prove arbitrary changes through mutable aliases, arrays declared with broad value
types, or type assertions. Use the runtime checks as well, and create scopes after you finish assembling
the registrations.
