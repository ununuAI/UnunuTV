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
node apps/cli/src/index.mjs workflow cinematic-author-screenplay \
  --project PROJECT --automation-run RUN \
  --screenplay-file /absolute/path/to/complete-screenplay.md
node apps/cli/src/index.mjs workflow cinematic-review-screenplay \
  --project PROJECT --automation-run RUN \
  --review-file /absolute/path/to/three-development-reviews.json
node apps/cli/src/index.mjs workflow canvas-reflow --project PROJECT
node apps/cli/src/index.mjs workflow provider-reconcile --project PROJECT
node apps/cli/src/index.mjs workflow cinematic-advance --project PROJECT
```

Before accepting the current Sequence Previs, play the visible Director
Console continuously from `0` to its exact duration with no manual seek. Save
that observed session through the official CLI, then pass the returned
server-owned receipt ID into the review:

```bash
node apps/cli/src/index.mjs sequence-previs playback-receipt \
  --project PROJECT --production PRODUCTION --previs PREVIS \
  --data '{"playbackSessionId":"SESSION","startedAt":"ISO","completedAt":"ISO","sampleCount":2881,"maxObservedStepMs":42,"manualSeekCount":0,"intervals":[{"startSeconds":0,"endSeconds":120}]}'

node apps/cli/src/index.mjs sequence-previs playback-receipts \
  --project PROJECT --production PRODUCTION --previs PREVIS

node apps/cli/src/index.mjs sequence-previs review \
  --project PROJECT --production PRODUCTION --previs PREVIS \
  --revision REVISION --state accepted \
  --data '{"playbackReceiptId":"PLAYBACK_RECEIPT_ID","note":"Owner 已完整播放并接受当前低模预演与切镜"}'
```

`accepted` fails closed when the receipt is missing, stale, seeked, gapped or
does not cover the current revision from `0` to `duration`. Never synthesize a
receipt from planned duration or a still screenshot.

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

When the current `repair` blocker is
`cinematic_development_review_required` or
`shot_performance_contract_required`, the same command may submit a revision
of the same `packageId` only when the structured row count/order is unchanged.
This is the canonical diagnosis → rewrite → re-review path; do not bypass it
with independent `story save`, `bible save`, or row mutations.

When the persisted blocker is `cinematic_shot_formation_required`, the
returned `nextAction` is `author_episode` and names the same
`workflow cinematic-author` command. A revision of the same `packageId` may
then split, merge, reorder or renumber structured rows so the scene/beat/shot
boundaries, 4–15 second segment durations and complete directing fields become
executable. `cinematic-author` validates the complete proposed formation
before persisting StoryPacket, VisualBible or any row. A failed repair leaves
all three unchanged. This repair-only validation must not force initial
screenplay scene blocks to masquerade as formed shots. This is the only blocker
that authorizes row-structure changes; submitting a different package or using
row primitives remains forbidden.

The formation nextAction binds the authoritative script node, current
screenplay revision and current content checksum. Copy its
`blocker.details.repairContract` unchanged into
`EpisodeAuthoringPackageV1.repairContract`, and use the same revision as
`sourceDocument.expectedRevision`. Never infer the node, revision or checksum
from chat memory. `cinematic-author` rejects a missing, forged or stale repair
contract before persisting screenplay, StoryPacket, VisualBible or rows.

Formation repair cannot change screenplay text, StoryPacket, Owner locks,
character/virtual-person authority lineage or VisualBible. When the screenplay
itself must change, request an explicit CAS-bound development mode:

```bash
node apps/cli/src/index.mjs workflow cinematic-revise-screenplay \
  --project PROJECT \
  --automation-run RUN \
  --expected-document SCRIPT_NODE \
  --expected-revision REVISION \
  --expected-checksum SHA256 \
  --reason "why the complete screenplay must be revised"
```

The command is idempotent and projects its active
`ScreenplayRevisionContractV1` onto the script canvas node. Copy the returned
contract unchanged into `EpisodeAuthoringPackageV1.screenplayRevisionContract`
and execute the returned `cinematic-author` nextAction. This path may revise
only the complete screenplay and StoryPacket; keep VisualBible and structured
rows byte-for-byte equivalent until the screenplay is saved and its three
development reviews rerun. The official save performs derived-state
invalidation; do not call reset or patch downstream tables.

For a migrated legacy project whose source node still contains prose but has
no `screenplayDocument`, the same command is the only bootstrap path. Bind
`--expected-document` to the visible source node, `--expected-revision 0`, and
`--expected-checksum` to the exact legacy `payload.content` SHA-256 returned by
the current runtime. The returned contract carries `legacyBootstrap:true`.
The following `cinematic-author` call may establish revision 1 of the complete
screenplay while preserving the current package ID, VisualBible and structured
rows. It must then invalidate old reviews and all screenplay-derived current
state. Never create the missing screenplay row through SQLite or a script.

When the revision changes only the complete screenplay text and the current
StoryPacket, VisualBible and structured rows must be preserved, use
`workflow cinematic-author-screenplay`. It reads the active revision contract,
current persisted package ID, StoryPacket, VisualBible and rows from UnuTV,
then submits one complete `EpisodeAuthoringPackageV1` through the same official
authoring use case. It never infers or rewrites rows, never imports a local shot
draft and refuses to run unless screenplay development is the exact persisted
nextAction.

When the next blocker is exactly `cinematic_development_review_required`, use
`workflow cinematic-review-screenplay` to submit one evidence-grounded review
bundle containing exactly one `script_doctor`, `dialogue_editor` and
`platform_editor` contribution. The command ignores stale binding fields in
the file, rebinds all three contributions to the exact screenplay
document/revision/checksum and StoryPacket revision returned by current
`nextAction`, persists them through the professional-contribution API and
executes that nextAction's `cinematic-advance`. It refuses every other phase
and cannot reuse an old contribution ID or revision.

For production nodes, the API/CLI call is valid only when it is the operation
named by the current Skill-driven `nextAction`. Do not use shell scripts,
direct database writes, browser clicks or free-form Agent prose as a hidden
authoring path.

## Canonical Character Authority review and projection

Read one card from:

```text
GET /api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/aggregate
GET /api/projects/:projectId/cinematic-productions/:productionId/asset-authority-aggregates
```

The response is keyed by `authorityId`. `canonicalAuthority` is the single
Authority truth; `currentAccepted` contains the accepted version/media,
checksum, review evidence and identity provenance; `formalSourceBinding` is
the only formal Prompt/reference source. `candidateRuns`, `mediaHistory` and
`authorityHistory` remain visible history. Every project asset in that history
has `projectAssetIsAuthority=false` and must not render as another character
Authority. `voiceStatus` is the same card's voice state.

For a current Character Authority identity image, reserve the review ID in the
candidate version's `identityProvenance.verificationReviewId`, then submit the
same ID with `owner_full_frame_pixel_v1` structured evidence.

When the Character Authority already uses an Ark `virtual_person_asset`, a
normal image Provider cannot claim that its output was derived from the asset
ID. The generated image must instead persist
`appearanceProvenance.role=appearance_authority`,
`faceIdentityDuty=external_virtual_person_asset`, and use
`owner_character_appearance_pixel_v1`. Face identity remains exclusively bound
to the virtual-person ID; the image controls only wardrobe, hair, makeup, body
proportion, silhouette and reference cleanliness. Example:

```json
{
  "reviewId": "review-owner-character-appearance-r3",
  "targetType": "media",
  "targetId": "media-current-character-appearance",
  "state": "accepted",
  "evidence": {
    "evidenceType": "owner_character_appearance_pixel_v1",
    "reviewerRole": "owner",
    "reviewMode": "full_frame_pixel",
    "targetMediaId": "media-current-character-appearance",
    "targetMediaChecksum": "exact-sha256",
    "assetId": "project-asset-media-history",
    "mediaRevisionId": "asset-version-current",
    "characterAuthorityId": "character-authority-current",
    "authorityRevision": 3,
    "virtualPersonAssetId": "asset-2026...",
    "faceIdentityDuty": "external_virtual_person_asset",
    "fullFrameCoverage": true,
    "checks": {
      "hair": "pass",
      "wardrobe": "pass",
      "makeup": "pass",
      "bodyProportion": "pass",
      "silhouette": "pass",
      "referenceCleanliness": "pass"
    }
  }
}
```

For an uploaded or genuinely verified identity derivative, use:

```json
{
  "reviewId": "review-owner-character-r3",
  "targetType": "media",
  "targetId": "media-current-character",
  "state": "accepted",
  "note": "optional human-readable note; never evidence",
  "evidence": {
    "evidenceType": "owner_full_frame_pixel_v1",
    "reviewerRole": "owner",
    "reviewMode": "full_frame_pixel",
    "targetMediaId": "media-current-character",
    "targetMediaChecksum": "exact-sha256",
    "assetId": "project-asset-media-history",
    "mediaRevisionId": "asset-version-current",
    "characterAuthorityId": "character-authority-current",
    "authorityRevision": 3,
    "fullFrameCoverage": true,
    "checks": {
      "identity": "pass",
      "face": "pass",
      "hair": "pass",
      "wardrobe": "pass",
      "makeup": "pass",
      "bodyProportion": "pass"
    }
  }
}
```

POST that object to `/api/projects/:projectId/reviews`, or pass it unchanged as
the data object to `workflow owner-decide`. The runtime re-reads the current
media checksum, asset version and Authority revision before persisting it. A
plain note cannot ACCEPT a controlled identity image. Existing reviews without
`evidence` remain readable but cannot promote/reference a formal identity.

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

For Authority image execution, compile and run the visible asset node itself;
do not generate a file elsewhere and import it. The canonical Ununu
`openai/gpt-image-2` request uses `n=1` and `background=opaque`. Character
appearance boards use `aspectRatio=3:2`, `resolution=1536x1024`; vertical
scene/prop boards use `aspectRatio=2:3`, `resolution=1024x1536`. The Prompt
describes the flat `#D2D2CE` character/prop background, framing, material and
lighting; the parameters carry provider/model/count/background/size. Core
must translate the persisted image raster to the Provider payload's `size`
field. Sending it as video-style `resolution`, allowing `size=auto`, or
repeating the raster/aspect/model in Prompt prose is a production blocker.
Core
must not admit wrong raster payloads directly. The only automatic recovery is a
separately traceable `authority_fixed_1k_v1` derivative that contains every Provider pixel
proportionally on the requested raster with `#D2D2CE` fill and records the
actual/expected dimensions. It must not crop, stretch, rotate or repaint the
subject, remains a candidate, and requires a new structured Owner full-frame
review before updating Authority status on the same canvas node.
Use this derivative only for isolated character/prop boards. A scene Prompt
describes observable vertical spatial depth while parameters carry the raster;
a landscape scene inside portrait padding remains rejected.
`gpt-image-2` must never receive `background=transparent`.

Immediately after `authority run` starts, re-read the original project-asset
node and its canonical Authority canvas card. The node must be `running`, and
the one visible card must show the current phase, `openai/gpt-image-2`, exact
raster, `n=1` and request/run trace. If the API state is running but the
canonical card has no loading surface, stop further submissions and repair the
shared aggregation/UI projection. Never add a duplicate image or Authority
node as a progress indicator.

Storyboard image batches use per-item rather than job-wide reference
configuration:

```text
referenceMediaIdsByStoryboardShotId[storyboardShotId]
referenceBindingsByStoryboardShotId[storyboardShotId]
```

The binding order is the exact Provider image order. Each binding carries
`mediaId`, checksum, sourceNodeId, asset/version/Authority revision, semantic
role and a typed `cinematic_reference:<role>` edge. Group Shots that cannot
fit all character Authorities must consume a visible deterministic Grid
composition of the current accepted character images as
`character_ensemble_authority`; they may not truncate people or borrow another
Shot's map. The Shot image execution node must persist the PromptDocument,
payloadHash, sourceVersions, request parameters and queued/running/error trace
before the network call. Before the first paid call, every non-imported queued
Shot in that batch must already expose the exact PromptDocument,
`size=1024x1536`, `background=opaque`, `n=1`, request trace and typed edges on
its existing canvas node. Do not defer this until each Shot reaches the head of
the queue. Any persistence failure blocks before Run creation and leaves the
exact Shot node visibly blocked; imported-media reuse does not invent a Prompt.

Reference 1 must be a visible clean Director frame: `image/png`, `864×1536`,
9:16, with exact lineage back to the current annotated Director composition.
A `960×540` SVG control sheet or any grid, route arrow, label, timing text or
editor overlay is non-Provider evidence and must be rejected rather than sent
as a generated-image reference. A stale Storyboard/Shot lineage quarantines
any late result and requires the persisted workflow repair action to create a
current batch.

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

# Separate a problematic source mix into reviewable candidate stems.
# This creates linked audio nodes on the same canvas; it does not auto-accept.
node apps/cli/src/index.mjs media separate-audio \
  --project PROJECT --media SOURCE_MEDIA --node SOURCE_VIDEO_NODE
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
