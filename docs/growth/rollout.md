# Katagami discovery and adoption rollout

## Positioning and audience

Type-safe dependency injection for TypeScript, with compiler feedback for AI-assisted development.
The first audience is developers building a new TypeScript application with coding agents who need
explicit dependency wiring, fake injection or request state. Avoid forcing a container into tiny apps.

## Release assets

- English and seven localized README entry points.
- npm description/keywords and [GitHub metadata](./github-metadata.json).
- [AI guide](../ai-coding-agents.md), [type guarantees](../type-safety.md), [API guide](../guide.md).
- [Runnable starter](../../examples/request-scope/README.md) with checked examples.
- [AI coding article](../articles/ai-coding-agents.md), [request scopes](../articles/request-scope.md),
  [decorator-free DI](../articles/without-decorators.md) and a [Japanese Zenn draft](../articles/ai-coding-agents.ja.md).
- [Evaluation protocol](../../benchmarks/agent-wiring/README.md) and results summarizer; agent benefits remain unmeasured.

## First four weeks

| Period | Action | Evidence to retain |
| --- | --- | --- |
| Week 1 | Ship checks, README, package metadata and starter; update GitHub Topics | Released version, CI run and public metrics snapshot |
| Week 2 | Publish the worked-example article on the owner's chosen blog/Zenn account; adapt relative links to the published location | URL, date, channel and campaign label |
| Weeks 3–4 | Observe 3–5 willing developers using the starter with their usual agent | Task attempted, first-run outcome, diagnostic confusion, whether they keep using it |
| Weekly | Capture npm trends and, locally, owner-only repository traffic | Non-overlapping date ranges and unavailable data recorded as null |
| After four weeks | Compare the funnel and fix the largest observed obstacle | Evidence for discovery, first successful use, continued use; no attribution from downloads alone |

Publishing destinations and interview participants are selected by the owner. The article files
are ready for adaptation, but an external publication or a participant interview must be recorded
only after it actually happens. Do not post or message people without authorization for that destination.

## Collect metrics

```sh
bun run metrics --output metrics.local/public.json
bun run metrics --traffic --output metrics.local/owner-traffic.json
```

The second command requires authenticated owner access through `gh` and contains private traffic
data. `metrics.local/` is ignored by Git. Do not commit those snapshots. Public release baselines can
be recorded separately under this directory. Re-run weekly: GitHub traffic is a short rolling window.

Track npm totals across four weeks using the non-overlapping weekly buckets, then compare with
the preceding four weeks. Downloads are not unique users or installations and can include automation.
Traffic, clones and external adoption reports provide different evidence; none alone is a conversion rate.
Where the chosen publication platform supports it, use a per-channel campaign link to a page with
analytics. GitHub alone does not provide complete visit-to-install attribution.

## Interview script

Ask a consenting participant to add a service and a fake to the starter using their normal agent.
Observe rather than coach the first attempt. Record:

1. What made the package seem relevant, and what almost stopped installation?
2. Did the first run work? Which command or prerequisite was unclear?
3. Could the agent fix a missing registration and an incorrect scope without suppressions?
4. Were error messages actionable? Which documentation did the participant or agent actually read?
5. Would the participant use it in a real project? Follow up on continued use with their consent.

Record observations without names or private code unless the participant agrees. A suggested
invitation, for an owner-approved channel:

> TypeScriptのDIコンテナKatagamiの導入体験を改善しています。普段使っているAIエージェントで
> 小さなサンプルにサービスとテスト用の依存を追加する、20分ほどの試用に協力いただける方を探しています。
> うまく動かない点や分かりにくい点を知りたいです。公開コードだけで参加できます。

## Search and claim hygiene

Keep the description specific to dependency injection. Link guides from the README and use actual
examples for queries about AI coding agents, request scopes and DI without decorators. `llms.txt`
is a navigation aid, not a promised ranking boost.

Sources: [npm discovery metadata](https://docs.npmjs.com/files/package.json/),
[npm README publication](https://docs.npmjs.com/about-package-readme-files/),
[GitHub Topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics),
[Google AI search guidance](https://developers.google.com/search/docs/appearance/ai-features).
