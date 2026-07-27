---
name: ununu-cinematic-production
description: >
  Operate UnuTV as the single end-to-end film-production Skill for films,
  series, multi-episode short drama, commercials, MV, animation, trailers, and
  social video. Use it for story and series canon, reusable asset authority,
  AI-video shot design, low-poly spatial previs, camera and actor trajectories,
  compiled image/video prompts, Provider submission, actual-take review,
  continuity, editing, sound, render, QC, and delivery. Every durable action and
  artifact must use the official UnuTV CLI/API and appear on a visible canvas
  node; the browser is read-only UI verification except while fixing UI bugs.
---

# Ununu 电影工业 Skill

Use this as the only Ununu film-production Skill. Do not route to another
Ununu video or operator Skill. UnuTV is the single durable runtime; this Skill
is its agent contract.

## Product definition

Treat UnuTV as an **AI-video low-poly previs and shot-control console**, not a
simplified Blender, a Prompt form, or a generic node-graph wrapper.

The Director Skill is the directing-language blueprint and quality floor, not
the product ceiling. This Skill owns the complete industrial path around it:
development, series canon, pre-production, reusable authority, production,
post-production, delivery and cross-episode memory. Do not stop after writing
assets, a shot list, Provider prompts or a previs.

Use low-detail geometry to lock what AI video is bad at preserving:

- scene topology, portals, zones, scale, collision and occlusion;
- actor positions, facing, gaze, contacts, paths and subject following;
- camera position, lens, framing, axis, path, speed curve, focus and stop state;
- start frame, decisive motion phases, end frame and edit handles;
- the relationship between blocking, performance, camera, sound and cut.

Do not spend effort on final character appearance or fine body animation in the
previs stage. Accepted visual assets own appearance. Director Stage owns space,
time and camera control. The Provider produces final pixels only after those
responsibilities agree.

## Single execution boundary

Perform every persistent operation through this repository:

```text
/Users/zhangxiaohao/ununu/ununuAI/ununu-unutv
```

Use `node apps/cli/src/index.mjs ...` or the loopback API at
`http://127.0.0.1:4318`, and only as commands prescribed by this Skill's
persisted `nextAction`. Never use Codex prose, ad-hoc terminal scripts or
browser interaction as an alternate production control plane. Never write
SQLite directly, call a Provider outside UnuTV, invent routes, or create a
second workflow.

The browser is read-only verification. Do not click, type, drag, upload,
generate, approve, reject, edit, or run production state in the browser.
Browser interaction is allowed only to reproduce or verify a UI bug after the
source fix.

Before the first mutation in a task, read
[api-cli.md](references/api-cli.md). For each mutation:

1. Resolve exact project, canvas, node and revision IDs.
2. State the bounded persisted delta.
3. Mutate through CLI/API.
4. Re-read the affected resource.
5. Verify the same state is visible on the canvas.

## Canvas-visible production law

Every source, contract, stage, request, candidate and delivery artifact must
bind a real node on the project's one visible canvas.

Canvas projection must be collision-free. Expanded node rectangles require a
visible gutter; no asset, Shot, Previs, Prompt, candidate, timeline or delivery
node may overlap another production node. When current node dimensions or a new
stage create a collision, status must return `canvas_nodes_overlap` and the
Agent must execute `workflow canvas-reflow` before continuing.

The Agent must repeat the collision audit after timeline, candidate-render,
delivery-QC, or manifest nodes are added. A completed episode is not
deliverable until the final `cinematic-status` reports no
`canvas_nodes_overlap` blocker. Browser appearance alone is not proof of a
collision-free canvas.

The main timeline must inherit the workflow delivery frame rate, width, height
and color space. An `ACCEPT + FIX_IN_POST` evaluation remains a hard render
gate until a timeline marker records the evaluation ID, completed repair
status, deterministic editorial action and full-playback verification. After
that evidence is persisted, `cinematic-advance` may retry the blocked render
stage without duplicating any Provider intent.

Required examples:

| Production object | Visible canvas projection |
| --- | --- |
| script / series canon | script or story node |
| VisualBible / project style | cinematic or asset node |
| character, scene, prop, costume, voice authority | asset node with accepted media version |
| Shot Intent / storyboard | shot or storyboard node |
| low-poly scene and camera previs | director node |
| image generation | image or imageEdit node |
| formal video GenerationUnit | videoShot or video node |
| dialogue / ambience / effects | audio node |
| continuity and take evaluation | review or qa node |
| timeline render / master | compose, video or audio node |
| QC / delivery manifest | qa or compose node |

Reject an operation when its execution/output node is absent, belongs to
another project/canvas, is hidden/audit-only, has the wrong kind, or does not
show the same effective revisions, Prompt, references, run and media IDs.
`nodeId: null` is never legal for generated or rendered production media.

The canvas is not a decorative diagram over a hidden second system. Lists,
timeline panels and inspectors may be alternate views, but the authoritative
execution object and current result must remain visible as a canvas node.

Every generative node must display its complete compiled Prompt before
dispatch. Every referenced character, scene, prop, style carrier, storyboard
frame, Director capture or accepted continuation must be a visible source node
with an explicit typed edge into the consuming node. A reference ID stored only
inside JSON is incomplete. The compiler must persist the Prompt and resolve the
edges; preflight and the formal run boundary must block missing or stale graph
evidence.

## Director Skill compatibility floor

Read [director-skill-bridge.md](references/director-skill-bridge.md) whenever
building assets, shots, previews or Seedance inputs.

Treat the referenced Director Skill workflow as the minimum production
semantics:

1. `05` establishes stable reusable asset identity and reference duties.
2. `04` turns the locked script into complete executable shot language.
3. `06` compiles only the Provider-facing prompt for the selected model.

Do not copy its template mechanically and do not stop at Prompt text. Compile
its semantics into UnuTV contracts, Director Stage geometry and gates. UnuTV
adds sequence canon, low-poly timed previs, camera routes, model capability
profiles, cost control, actual-take memory, editing, sound, QC and delivery.

Never write a random Prompt. Every image/video Prompt is a deterministic
projection of current accepted Story, Authorities, Shot, Previs,
ReferenceBinding, Provider capability and continuity state.

## Canonical production flow

Run this dependency order. Persist a blocker instead of inventing missing
facts or silently skipping a gate.

1. **Develop**: classify project/series, episode, platform, target duration and
   audience; create Series for episode one when recurrence is expected.
2. **Lock story**: store exact source facts, dialogue, causal events, character
   objective/resistance/subtext, reveal order, entrance/exit state and Owner
   locks. Accept the exact current revision.
3. **Build visual rules**: define format, camera grammar, motivated light,
   palette, production design, sound and VFX physics.
4. **Build reusable authority**: create only risk-relevant character, scene,
   prop, costume and voice assets; inspect actual pixels and promote accepted
   versions. Reuse accepted authority before generating new assets.
5. **Design Shot Intent**: define narrative job, opening/trigger/action/reaction/
   ending state, blocking, performance, camera purpose, light, sound, physics,
   edit boundary and visible acceptance checks.
6. **Create low-poly previs**: stage scene zones, actor routes and camera route;
   preview 2.5D top-down, editor view, camera POV and start/end frames; play the
   timed motion and accept the exact revision.
7. **Compile sequence context**: create a playable `SequencePrevisDocument`,
   one `CutDecision` for every boundary and one current
   `VisualContextBundle` for every Shot.
8. **Choose reference mode**: use exactly one supported shape:
   `text_to_video`, semantic `image_reference`, literal `first_frame`, or
   literal `first_last_frame`. Bind exact media/checksum and responsibility.
9. **Compile Prompt Draft**: project all structured facts through one compiler;
   lint byte limits, reference order, image/text conflict, camera/focus/motion,
   continuity, dialogue duration and Provider capability.
10. **Run cheap proof first**: use low-poly playback, stills, animatic, local
    render and contract simulation. Image generation may iterate freely because
    it is the low-cost exploration surface, but every candidate remains
    versioned and canvas-visible. Do not use paid video rerolls to discover a
    blocking, camera or continuity mistake. Every per-Shot storyboard image
    must compile a single frozen keyframe even when the batch omitted an
    explicit keyframe moment: derive it deterministically from the accepted
    Shot turning point, ending state or story beat. The resulting pixels must
    be one full-frame exposure in one continuous space; reject and regenerate
    collages, split screens, montage grids, contact sheets or repeated-time
    layouts before video Prompt compilation.
11. **Record formal-generation intent**: bind the exact GenerationUnit
    revision, compilation/payload hash, accepted previs revision, output node,
    Provider/model and a maximum of one new submission. A changed source makes
    the intent stale.
12. **Submit once**: use a stable idempotency key. Poll an unresolved request;
    never submit a replacement while outcome is unknown. When status returns
    `paid_submission_outcome_unknown`, execute only the persisted
    `workflow provider-reconcile` action. The Skill may abandon and requeue an
    unconfirmed `provider_account` image intent because images are the declared
    zero-cost exploration surface. It must never automatically abandon,
    duplicate or replace an unknown video/audio submission. A recovered
    synchronous Ununu image run that has lost its original worker and remains
    unresolved for five minutes must become this explicit reconciliation
    action instead of holding the episode for the Provider's full timeout.
13. **Review actual time**: inspect the complete candidate, record actual
    phases, usable range, vetoes, entry/exit state and ACCEPT/PARTIAL/REJECT.
    Candidate media is never implicit ACCEPT. Bind each evaluation to that
    Shot's visible three-frame QA evidence node, but also play the complete
    candidate from start to end; a contact sheet never substitutes for
    full-timeline review.
14. **Continue from accepted reality**: compile the next unit from the latest
    accepted actual exit state, not planned state or chat memory.
15. **Edit, sound, render and deliver**: assemble only accepted ranges; bind
    render output to a visible node; run technical QC; create a traceable
    delivery manifest.

The persisted runtime expresses that work as one authored episode gate plus
exactly these 14 ordered stages:

```text
author_episode
  → script_analysis
  → block_planning
  → visual_bible
  → asset_design
  → shot_design
  → previs_design
  → image_generation
  → prompt_compile
  → video_generation
  → sound_design
  → continuity_qa
  → timeline_edit
  → candidate_render
  → delivery_qc
```

`author_episode` must atomically write one complete
`EpisodeAuthoringPackageV1`: StoryPacket, VisualBible and all structured
episode rows with exact total duration. `previs_design` must project real
low-poly frames, actor paths, camera routes, POV state, cuts and per-shot
visual context before it may unlock reference-image generation. Binding an
accepted previs creates a new Shot revision; that exact revision requires a
new Owner acceptance before paid video preflight.

## Director Stage minimum contract

For every moving or spatially risky Shot, persist:

- `scene`: world/zone IDs, portals, fixed obstacles, actor and prop proxies;
- `actors`: start/end transforms, facing, gaze, contacts, paths and timing;
- `camera`: route ID, ordered nodes, timestamps, position/orientation or
  look-at, lens/FOV, aspect ratio, focus distance and speed interpolation;
- `frames`: accepted start, decisive midpoint(s) and end composition;
- `axis`: attention axis, allowed camera side and motivated crossing rule;
- `views`: `top_2_5d`, `editor`, `camera_pov`, and start/end comparison;
- `playback`: duration, FPS, continuous actor/camera interpolation;
- `acceptance`: current revision, visible route overlay, Owner verdict and
  invalidation lineage.

Support fixed, push/pull, pan/tilt, track, follow, crane, handheld, left/right
arc, orbit and multi-node paths. A camera-motion adjective without a visible
route and start/stop state is not a camera plan.

Simple static shots may skip timed previs only when a structured risk check
records why blocking, axis, camera motion and continuity are already provable.
They still require a visible Shot node and accepted start/end composition.

## Asset and reference discipline

Prefer reuse in this order:

1. current accepted frozen Series/Project Authority;
2. accepted child variant with explicit parent lineage;
3. accepted current-episode asset;
4. new image candidates for a gap or intentional visual exploration.

Image generation has no spend gate. Generate and compare as many structured
image candidates as useful, but do not randomize the production contract,
overwrite accepted Authority, hide candidates outside the canvas, or
auto-promote an unreviewed image. Reuse remains the default for continuity, not
a restriction on useful image exploration.

Keep appearance, spatial, temporal and control responsibilities separate.
Read
[cross-modal-image-video-control.md](references/cross-modal-image-video-control.md)
before any image/video transition.

A semantic reference is not automatically `t0`. A first frame owns literal
`t0`; a last frame owns literal `tEnd`; the Prompt and temporal plan still own
the transitions. Annotated control images are never clean Authority or literal
frame carriers.

The canvas node, Prompt Draft and Provider request must expose the same ordered
effective reference manifest. Do not expose internal IDs as naked Prompt
language; compile them to natural-language controls and official media
references.

## Formal video cost and reroll policy

Video is expensive, but it is a normal required production stage. Generate it
when the upstream evidence is ready; do not normalize blind “抽卡”.

- Preflight readiness plus accepted low-cost proof authorizes the workflow to
  create an exact formal-generation intent; this is not a second billing popup.
- Require that exact formal-generation intent at the run boundary.
- Allow at most one new Provider submission for that exact intent.
- Reusing/polling the same idempotent request is not a new submission.
- Never retry while the previous outcome is unknown.
- Diagnose a rejection before the next intent.
- Change one attributable control variable per retake.
- Use `REROLL` only when the contract is correct and the failure is sampling
  variance; otherwise use `REWRITE`, `REANCHOR`, `EDIT_SOURCE` or post repair.
- Never auto-accept a take, freeze an unreviewed asset or continue from a
  rejected candidate.

Provider credentials and billing stay outside project creative state, but the
runtime must still enforce the formal-generation intent and idempotency gate.

## Actual-take memory and long-form continuity

Read:

- [sequence-previs-visual-memory-and-trace.md](references/sequence-previs-visual-memory-and-trace.md)
- [sequence-state-canon-retake-control.md](references/sequence-state-canon-retake-control.md)

Use `VisualTakeMemory` and `CinematicEvaluationRecord` for real observed
screen state. Only the latest ACCEPT may update canon, supply a continuation
frame or unlock editorial stages.

Continuity QA is complete only when every active GenerationUnit has one latest
evaluation for its current candidate, with real take observation and accepted
canon reconciliation. One accepted Shot never unlocks the rest of an episode.
For units whose execution gate requires a structured continuity audit, also
persist `actualContinuityState`. Project the evaluation ID, decision, usable
ranges, actual exit state and repair notes onto the visible QA evidence node.

For multi-episode work:

- create Series at episode one;
- freeze accepted identity assets;
- bind shared assets before each episode;
- carry revealed facts, forbidden-early information, injuries, props,
  relationships, wardrobe and location state through the continuity ledger;
- commit accepted episode-end canon after editorial review;
- never create a new face or scene version merely because a new episode began.

## Persisted next-action loop

Drive the workflow from state, not chat memory:

```text
cinematic-start
  → cinematic-status
  → execute exactly nextAction
  → re-read status
  → done or explicit blocker
```

Interpret `advance/run_worker`, `wait_provider`, `owner_gate`, `repair`,
`promote_asset`, `commit_ledger`, `done` and `failed` literally. Do not invent
a parallel stage or use storyboard batch as formal video.

The Agent is an executor, not a second director or workflow author:

- it may inspect state, execute the one returned `nextAction`, and report the
  persisted result;
- it may not improvise a different phase order, free-write a production Prompt,
  create unlinked references, accept a creative revision, or bypass a blocker;
- local shell work is permitted only to develop, repair and test UnuTV or this
  Skill, never to author or mutate a film outside the official UnuTV API/CLI;
- browser interaction is permitted only for UI defect reproduction and
  verification, never for production mutation.

`workflow short-drama` and `workflow one-shot` may only enter the same canonical
workflow. Legacy `produceShortDramaOnCanvas` and production-bound direct
`node run` are forbidden.

## Completion evidence

Report:

- project/canvas/production/series/episode IDs;
- current Story, Authority, Shot, Director Previs and GenerationUnit revisions;
- visible execution/output node IDs for every generated/rendered artifact;
- Prompt compilation/payload hash and exact reference manifest;
- Provider run/idempotency status without exposing credentials;
- actual candidate media/checksum, evaluation and accepted usable range;
- full-playback receipt and visible QA evidence node for every active unit;
- collision audit proving expanded canvas node rectangles have a visible gutter;
- timeline, render, QC and delivery IDs;
- blockers and the single next action.

Do not claim a film, episode, Shot, reference, Prompt, preview, candidate,
render or delivery exists unless it is persisted and visible in UnuTV.
