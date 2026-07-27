---
name: ununu-unutv-operator
description: >
  UnunuTV ops dictionary / execution layer via CLI and loopback API. Not the
  primary creative orchestrator — prefer ununu-video for end-to-end short-drama
  platform loops (series, nextAction, advance). Use this skill for low-level
  resource mutations, verification, and recovery. Never invent a second pipeline.
  The legacy `produceShortDramaOnCanvas` path is sealed and must not be called.
---

# UnunuTV 影视制作执行器（运维字典）

**主入口**: `ununu-video`。本 Skill 是 API/CLI 运维字典与执行层，不是主脑。

Operate durable UnunuTV state and Provider work. The Agent is an input adapter,
not the production orchestrator: UnunuTV owns the persisted cinematic workflow,
contracts, prompt compilation, preflight, Provider dispatch, continuity, edit,
render, and delivery. Do not redesign the story,
VisualBible, shot, GenerationUnit, expert contribution, or compiled Prompt.

## Hard execution rule

Every project, canvas, node, edge, media, asset, authority, storyboard, shot,
generation unit, prompt, review, run, timeline, render, and contract mutation
must go through this Skill's repository CLI or loopback UnunuTV API. Never use
the in-app browser to create, edit, upload, generate, approve, reject, or run
production state; the browser is read-only verification only. Do not call a
parallel image/video pipeline or provider script outside UnunuTV's registered
nodes and adapters. The only exception is an explicitly scoped UI/code bug
fix, which must use `apply_patch` and then be verified again via the API/CLI.

## Product boundary

- Source: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv`
- Runtime: `~/.unutv`
- API: `http://127.0.0.1:4318`
- Canonical start: `npm run start` or `npm run dev`
- One user, one project database, one canvas; binaries stay in project media.
- Use only this repository's CLI. Never write SQLite directly or use legacy
  products, global commands, ports, routes, or compatibility APIs.
- For end-to-end work use `workflow short-drama` only as the canonical entry
  adapter, then consume `workflow cinematic-status` and execute exactly the
  returned `nextAction`. Never call `produceShortDramaOnCanvas` from an Agent,
  CLI route, API route, or external script.
- Never invent a missing character, scene, prompt, reference image, or approval.
  Missing evidence is a persisted blocker, not a reason to use a placeholder or
  silently downgrade image-reference video to text-to-video.
- UnunuTV is the only execution runtime. Never invoke or install ComfyUI,
  translate production contracts into node graphs, or require local checkpoint
  and custom-node paths.

Read [api-cli.md](references/api-cli.md) before the first mutation in a task.

## Execute a bounded delta

1. Resolve exact project, production, entity, asset version, media, model, and
   run IDs from current state.
2. State the intended persisted delta and evidence.
3. Use CLI when supported; otherwise use loopback HTTP.
4. Re-read the narrow affected resource after mutation.
5. Inspect the Web UI when visual behavior matters.
6. Report IDs, endpoint/command, persisted state, Provider/run status, and
   local media evidence.

For a production created with `--source-node`, re-read `sourceNodeId` from the
production receipt before continuing. If a source must be bound after creation,
use `production update` and verify that the local adapter persisted the column;
do not assume a successful CLI exit proves the binding. After script planning,
verify nested `cinematography.shotSize`, `cinematography.movementPath`,
`editContinuity`, and Storyboard `durationSeconds` rather than checking guessed
top-level fields.

For “continue”, resume from verified runtime state, not chat memory.

## Route direct and production execution

- `direct`: operate an isolated canvas node experiment through node prompt/run.
- `production`: accept versioned `StoryProductionPacket`, `VisualBible`,
  optional character/scene/prop authority, `CinematicShotSpec`,
  `GenerationUnit`, bindings, contributions, compiled image/video envelopes,
  run, and evaluation resources.

When production execution also needs creative design, invoke
`ununu-cinematic-production` first. Do not infer missing creative fields.

## Protect authority and references

- Bind exact assetId/versionId/mediaId and accepted authority revision.
- Keep identity, costume, hair/makeup, scene appearance, geometry, props,
  frames, and motion responsibilities separate.
- Follow compiler-provided `ReferenceBinding` order exactly. Do not rename a
  person to a synthetic subject label or create absent references.
- Publish only signed, expiring `/provider-media/` URLs when a remote Provider
  needs HTTPS. Never expose `/api/` through the tunnel.
- Preserve accepted branches. Authority changes invalidate only dependents.

Read [director-continuity.md](references/director-continuity.md) for Director
Stage, panorama, spatial authority, or camera export work.

## Submit only compiled production work

For a formal generation unit:

1. Require the current `CinematicPromptEnvelopeV2` and its embedded
   `CinematicPromptDraftV1`.
2. Verify the Draft source revisions, ordered sections, payload hash, reference
   order, lint, and exact model preflight. The Draft's compiled text and
   effective reference bindings must equal the envelope; otherwise stop.
3. Keep `compiledContentPrompt` separate from `GenerationParameters`; never
   reconstruct a Prompt from UI text at dispatch time.
4. Require a real video execution node and compiled
   `billingMode: "provider_account"` for the formal cinematic workflow. This
   path has no project budget, reservation, spend approval, or UI paid gate.
   There is no separate “approve this spend” step. Owner decisions remain
   required only for creative acceptance, asset promotion, publication, and
   destructive actions.
5. Persist and link the run to its generation unit and compilation.
6. Poll asynchronous work without blind Provider retry.
7. Materialize success into project media and verify checksum/path/state.

Never alter the compiled content Prompt inside a Provider adapter. Never print
plaintext credentials.

### Reference modes are explicit

The operator must preserve the distinction between a semantic storyboard
reference and a literal frame input. A selected `storyboard_composition` is an
identity/scene/spatial anchor; it does not become `first_frame` merely because
it is the first image in a card list. `first_frame` and `first_last_frame` are
separate mutually-exclusive modes. Every positive reference needs a complete
binding and `doesNotControl` boundary, and a missing binding is a blocker.

The canonical short-drama entry accepts only structured StoryPacket,
VisualBible, script rows and real media bindings. It never expands a brief
into generic characters, fixed-camera shots, dialogue or placeholder images.
When the image stage creates storyboard anchors, it must explicitly select the
result before video compilation. A Provider success is a candidate, not an
ACCEPT; only a real latest evaluation can unlock continuity and editorial
stages.

For character, scene, prop, or storyboard image work, persist the authority
resource and accept only `CinematicImagePromptEnvelopeV2`. Keep the image
content Prompt separate from image generation parameters and route execution
through existing UnunuTV image nodes/Provider adapters. Do not create a second
image pipeline or a workflow-engine compatibility layer.

## End-to-end workflow entrypoint

For an end-to-end cinematic request, use the canonical Skill workflow boundary:

```text
ununu-unutv workflow cinematic-start --project ID --production ID --source-node ID --target-duration 30
GET /api/projects/:projectId/cinematic-workflow/status
```

This creates a versioned `UnunuCinematicWorkflowManifest` and a persisted
13-stage AutomationRun. It is an orchestration boundary, not a hidden Provider
shortcut: start is provider-safe, stages pause on creative or contract
blockers, and a preflight-ready stage is dispatched through the configured
Provider account. There is no project-budget step and no separate spend/paid
approval. Other AI agents may consume the same contract, but they must use
these CLI/API boundaries and must not mutate SQLite, the browser, or an
external workflow graph. The brief-only `workflow short-drama` entry creates
only the minimal project/source records and then enters this same boundary; it
does not create creative content outside the workflow.

## Review and persistence

Read [generation-review.md](references/generation-review.md) before accepting or
assembling generated media. A successful request is not an accepted result.
Record full-timeline evidence in `CinematicEvaluationRecord`; pass only accepted
actual exit state downstream.

Stop instead of fabricating when IDs, capabilities, references, authority,
preflight, complete media, or persistence evidence are missing.

## Owner-only decisions

Owner approval is required for creative acceptance, durable asset promotion,
publication, and destructive deletion. Provider-account dispatch is controlled
by the compiled contract and preflight; saving a credential is not a creative
acceptance or publication decision.
