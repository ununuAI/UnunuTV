# UnuTV API and CLI boundary

## Runtime

```text
source: /Users/zhangxiaohao/ununu/ununuAI/ununu-unutv
data:   /Users/zhangxiaohao/.unutv
API:    http://127.0.0.1:4318
CLI:    node apps/cli/src/index.mjs
```

Start with `npm run dev` or `npm run start`. For local debugging without the
public media tunnel, use the explicitly named local-only script.

The API is loopback-only. Only signed, expiring `/provider-media/` URLs may
cross a configured HTTPS tunnel. Never expose `/api/`.

## Mutation discipline

Use CLI when it supports the exact operation; otherwise use the loopback API.
All commands return JSON. Run `node apps/cli/src/index.mjs --help` for the
current command surface instead of relying on a copied stale command list.

Never:

- write `catalog.sqlite` or `project.sqlite`;
- use the browser for a production mutation;
- call a Provider directly;
- invent an endpoint or field;
- print credentials;
- create generated/rendered media without a visible execution/output node.

After each mutation, re-read the affected resource and its canvas node. Verify
semantic fields and revisions, not only HTTP status.

## Canonical workflow

```bash
node apps/cli/src/index.mjs workflow cinematic-start \
  --project PROJECT --production PRODUCTION --source-node SCRIPT \
  --target-duration 60

node apps/cli/src/index.mjs workflow cinematic-status --project PROJECT
node apps/cli/src/index.mjs workflow cinematic-author \
  --project PROJECT --automation-run RUN \
  --file /absolute/path/to/episode-package.json
node apps/cli/src/index.mjs workflow canvas-reflow --project PROJECT
node apps/cli/src/index.mjs workflow provider-reconcile --project PROJECT
node apps/cli/src/index.mjs workflow cinematic-advance --project PROJECT
```

Run the same canvas audit/reflow after timeline, candidate-render, delivery-QC
and manifest projection. Final delivery is blocked until the canvas has no
overlapping expanded node rectangles.

For an accepted take that requires deterministic post repair, record the
completed editorial action on the main timeline before render:

```bash
node apps/cli/src/index.mjs timeline marker-add --project PROJECT --timeline TIMELINE --data '{"timeMs":24000,"label":"S03 post repair","payload":{"evaluationId":"EVALUATION","repairStatus":"completed","repairKind":"editorial_non_reliance","action":"保持连续运动，不停帧、不放大非权威文字","verifiedBy":"full_playback"}}'
```

`cinematic-advance` may then retry the current render stage. It must not create
a second paid Provider generation intent.

Use `workflow short-drama` only as an entry adapter to the same persisted
workflow. Follow returned `nextAction`; do not reconstruct the stage sequence
from chat memory.

When status returns `author_episode`, use only `workflow cinematic-author`.
The input must be one complete `EpisodeAuthoringPackageV1` with StoryPacket,
VisualBible and structured script rows whose durations add up to the workflow
target. The command projects the source, story and bible onto visible canvas
nodes and connects their stage edges. Do not call `story save`, `bible save`
and row primitives as an alternate authoring workflow.

For production nodes, the API/CLI call is valid only when it is the operation
named by the current Skill-driven `nextAction`. Do not use shell scripts,
direct database writes, browser clicks or free-form Agent prose as a hidden
authoring path.

When the current blocker is `paid_submission_outcome_unknown`, use only
`workflow provider-reconcile`. It validates the exact batch item and provider
run. It may abandon and requeue an unconfirmed `provider_account` image
intent; unknown video/audio work remains blocked for explicit provider-side
tracing and must not be resubmitted.

When a runtime defect has already created duplicate queued/running Ark video
tasks for the same GenerationUnit revision and compiled payload, pause the
automation first. Preserve exactly one authoritative Provider Run per unit and
cancel each duplicate through:

```bash
node apps/cli/src/index.mjs run cancel \
  --project PROJECT --run RUN \
  --reason duplicate_formal_intent_cleanup
```

Never call the Provider DELETE endpoint directly. The CLI records `canceled`
in project Run history and leaves the authoritative canvas result untouched.
After cleanup, verify the one-run-per-unit invariant before resuming.

Prompt compilation must project the exact compiled Prompt onto the consuming
canvas node. Each `ReferenceBinding` must resolve to a visible source node and
an explicit `cinematic_reference:<role>` edge. Treat
`canvas_reference_node_required`, `canvas_reference_edge_required` and
`canvas_production_graph_not_ready` as production blockers; never delete the
reference, change modes or submit Provider work merely to get past them.

## Formal media paths

Production images use current Authority/Storyboard compilation and an image
execution node. Production video uses:

```text
GenerationUnit → compile → preflight → accepted low-cost previs
→ formal-generation intent → idempotent run → full-timeline evaluation
```

At continuity QA, persist visible start/middle/end evidence next to every
GenerationUnit video node:

```bash
node apps/cli/src/index.mjs media qa-sheet \
  --project PROJECT --media VIDEO --node GENERATION_UNIT_NODE \
  --data '{"times":[0.5,6,11.5]}'
```

The command extracts exactly three frames, composes one visible canvas contact
sheet and connects it with `cinematic_qa:contact_sheet`. It is evidence for
review, not a substitute for full video playback or a CinematicEvaluationRecord.

After complete playback, add one evaluation for every active GenerationUnit.
Set `sourceNodeId` to the video execution node and `evidenceNodeId` to its
visible three-frame QA node:

```bash
node apps/cli/src/index.mjs evaluation add \
  --project PROJECT --production PRODUCTION \
  --data '{"generationUnitId":"UNIT","sourceNodeId":"VIDEO_NODE","evidenceNodeId":"QA_NODE","mediaId":"VIDEO","decision":"ACCEPT",...}'
```

The latest record for every active unit must be `ACCEPT`, include
`takeObservation` and an accepted `canonReconciliation`, and satisfy every
GenerationUnit `reviewRequirements` check. Units configured with
`requireContinuityStateAudit` additionally require `actualContinuityState`.
Never use one episode-level evaluation as a substitute for per-unit review.

Timeline rendering additionally requires `--output-node NODE`. The output node
must exist on the current canvas and have a compatible media kind.

Direct `node run` is allowed only for an explicitly isolated `direct`
experiment. A production-bound node must fail closed.

## Verification receipt

Record project/canvas/node IDs, exact revisions, media/checksum, compilation
hash, Provider run/idempotency status, evaluation, timeline, render/QC and
delivery IDs. Missing persistence or canvas projection is a blocker.
