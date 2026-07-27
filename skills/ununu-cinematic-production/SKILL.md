---
name: ununu-cinematic-production
description: >
  Deep cinematic contract appendix for UnunuTV (story/shot/previs/prompt design).
  For end-to-end short-drama / multi-episode orchestration prefer ununu-video
  (thin remote control + nextAction). Use this skill when you need industrial
  contract detail; pair with ununu-unutv-operator for durable mutations only.
  UnunuTV remains the sole orchestrator and runtime; the Agent only supplies
  structured creative input and decisions.
---

# Ununu 影视工业制片总控（附录）

**主入口已迁移**: 平台编排请用 `ununu-video`（`status.nextAction` 循环）。
本 Skill 保留为深度合同 / 预演 / Prompt 设计附录，不是第二套出片流水线。
禁止从 Agent 或兼容入口调用旧的 `produceShortDramaOnCanvas`；所有短剧入口都必须
进入 UnunuTV 的 `startCinematicWorkflow`，再按持久化 `nextAction` 推进。

Turn creative intent into revisioned production contracts, continuous visual
evidence, provider-ready prompts, and reviewed actual screen state. Keep
UnunuTV as the only durable production runtime.

## Mandatory UnunuTV execution boundary

All durable UnunuTV work MUST run through the repository's
`ununu-unutv-operator` Skill API/CLI and the loopback UnunuTV API: projects,
canvases, nodes, edges, media, assets, authorities, storyboards, shots,
generation units, prompts, reviews, runs, timelines, renders, and production
contracts. Do not write SQLite, call an alternate product, invent HTTP routes,
or use a browser to perform production mutations.

The in-app browser is read-only verification only: use it to inspect visible
state after an API/CLI mutation. Do not click, type, drag, upload, generate,
approve, reject, or otherwise write production state from the browser. The
only exceptions are an explicitly scoped UI bug fix or a source-code change;
those must be implemented with `apply_patch`, then re-verified through the
UnunuTV API/CLI and read-only browser inspection. Image/video/provider work is
not an exception: it must use existing UnunuTV image/video nodes and provider
adapters through the Skill API/CLI.

The Agent is not a second creative runtime. It may submit the Owner's brief,
locked facts, approved media IDs, annotations, structured camera/motion data,
and Owner decisions. UnunuTV must own story decomposition, shot planning,
reference binding, prompt compilation, preflight, Provider dispatch, continuity
review, timeline assembly, render, and delivery. If one of those inputs is
missing, persist a blocker and stop; never invent a character/scene/Prompt,
create a placeholder image, auto-accept a revision, or silently remove an
image reference.

## Canonical input and reference modes (runtime-enforced)

There are only two legal ways to enter visual production:

1. **Owner-supplied anchors**: import the user's real character/scene/prop
   media through the UnunuTV media/asset/authority APIs, preserve its exact
   `mediaId`/checksum and declared controls, then bind it to the relevant
   storyboard shot or GenerationUnit.
2. **UnunuTV-created anchors**: derive the VisualBible/shot storyboard from
   already structured story and shot contracts, generate the still through the
   UnunuTV image stage, select the generated image as a semantic storyboard
   composition, and only then compile the video unit.

Both modes converge on the same `ReferenceBinding` manifest. A semantic image
reference is not a first frame: it carries identity, scene topology, spatial
blocking, costume/material and other explicitly listed static facts; the shot
contract carries time, action, performance, camera path, focus, physics and
edit boundary. `first_frame`/`first_last_frame` are literal temporal boundary
inputs and are mutually exclusive with ordinary references for models that
forbid mixed inputs. The runtime rejects missing bindings, mixed modes and
implicit downgrades instead of submitting a text-only request.

The one-shot entry accepts only structured `StoryPacket`, `VisualBible`, script
rows and reference bindings. A brief is raw source material, not permission to
invent a protagonist, dialogue, scene, fixed camera or generic action. When a
required contract is absent, the durable workflow records a blocker and
stops. It does not fabricate an image or auto-ACCEPT a take.

After image generation, every generated storyboard image must be explicitly
selected as `storyboard_composition` (unless the shot intentionally selected a
literal first-frame role). The executor may persist a video as a **candidate**,
but only a real `CinematicEvaluationRecord` can become ACCEPT and unlock
continuity, timeline, render and delivery.

## Load the mandatory production references

Before any production image, video, continuation, or edit decision, read and
execute:

- [cross-modal-image-video-control.md](references/cross-modal-image-video-control.md)
  for image-reference versus first/last-frame roles, prompt coverage, acting,
  annotations, motion, camera, seams, and image/text conflict checks;
- [sequence-previs-visual-memory-and-trace.md](references/sequence-previs-visual-memory-and-trace.md)
  for the continuous playable visual model, CutDecision, per-shot context,
  Owner acceptance gate, actual-take memory, and decision trace;
- [sequence-state-canon-retake-control.md](references/sequence-state-canon-retake-control.md)
  for actual accepted exit state, continuation depth, canon reconciliation,
  and retake discipline.

Read the cinematic contract documents only as the current task requires:

- [01-overview.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/01-overview.md)
- [02-story-and-visual-bible.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/02-story-and-visual-bible.md)
- [02a-asset-authority-and-image-prompts.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/02a-asset-authority-and-image-prompts.md)
- [03-shot-contract.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/03-shot-contract.md)
- [04-generation-unit-and-anchors.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/04-generation-unit-and-anchors.md)
- [05-prompt-compilation.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/05-prompt-compilation.md)
- [06-expert-routing.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/06-expert-routing.md)
- [07-provider-boundary.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/07-provider-boundary.md)
- [08-quality-review-and-feedback.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/08-quality-review-and-feedback.md)
- [09-knowledge-to-shot-execution.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/09-knowledge-to-shot-execution.md)
- [10-text-image-video-edit-pipeline.md](/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/cinematic/10-text-image-video-edit-pipeline.md)

## Build and approve in dependency order

1. Classify `projectType` and choose `direct` only for an isolated experiment.
   Use `production` whenever story, identity, space, performance, camera,
   action, sound, editing, or continuity matters.
2. Build `StoryProductionPacket` from source facts, exact dialogue, causal
   events, character objective/resistance/subtext, entrance/exit state,
   irreversible facts, forbidden early information, and Owner-locked text.
3. Audit the current Story revision before visual planning. Resolve motive,
   causal sufficiency, reveal order, prop custody, limb occupancy, and movement
   vector. Do not invent retreat, escape, or a sealed exit when the characters
   entered to attack. Persist the exact revision verdict; latest review wins.
4. Build `VisualBible` with project camera grammar, motivated light, palette,
   character look, production design, material/aging, sound, VFX physics,
   spatial rules, and continuity locks.
5. Build the complete ordered `CinematicShotSpec` set. Each Shot needs a
   narrative job, opening/trigger/action/reaction/ending state, named blocking,
   performance beats, camera trajectory and purpose, light, sound, physics,
   edit boundary, and visible acceptance checks.
6. Audit the whole Shot script against the accepted Story revision. Treat
   adjacent Shots as one state machine and preserve position, facing, axis,
   gaze, hands, contacts, props, injuries, damage, counts, action phase, light,
   and sound unless a visible cause changes them. Persist Owner acceptance for
   every exact current Shot revision.
7. Create only the `CharacterAuthoritySet`, `SceneAuthoritySet`, and
   `PropAuthoritySpec` required by current risks. Review actual pixels at
   original resolution; accepted text or status is not pixel evidence.
8. Create a playable `SequencePrevisDocument` before formal video generation.
   It must bind the accepted story and current ordered Shots, real reviewed
   frames, one CutDecision for every boundary, and a current
   `VisualContextBundle` for every Shot. Candidate drafts may be incomplete;
   Owner ACCEPT and generation may not.
9. Group one or more artistic Shots—or one Provider segment of a long take—into
   `GenerationUnit`. Never collapse Shot, Provider request, and continuation
   segment into one object. Bind the accepted Sequence Previs revision and the
   current Shot's VisualContextBundle.
10. Route professional contributions, compile a visible Prompt Draft, run the
    complete preflight, and dispatch automatically through the configured
    Provider account. Approval is for the current Story/Shot/Previs/Authority
    facts and the resulting creative take—not for a second billing dialog.

## Preserve physical and dramatic truth

- Lock objective, target, world axis, screen vector, actor facing, eyelines,
  leading foot, weapon/VFX direction, and camera direction to one compatible
  motive.
- Reject impossible limb use or invisible prop transfer. A hand holding a
  weapon cannot simultaneously make an incompatible contact.
- Decompose every unusual identity/anatomy rule into required ordinary state,
  required abnormal state, and forbidden common interpretations. A failed
  defining identity, anatomy, topology, count, origin, or contact is a veto;
  aggregate quality cannot compensate.
- Keep exact-count props visible from origin through independent paths,
  contacts, consequences, and remains. Sample high-risk action every
  0.25–0.5 seconds during review.
- Write acting as visible causality: initial state, stimulus, attention,
  judgment/subtext, restraint, breath/tension, hands/weight, control break,
  consequence, and recovery. Use evidence readable at the selected shot size.
- Never claim an opaque surface or off-camera fact is visible. Keep offscreen
  identity rules as Authority invariants and apply the pixel veto when that
  surface appears.

## Select image and motion control honestly

Use exactly one Provider input shape supported by the registered model:
`text_to_video`, semantic `image_reference`, literal `first_frame`, or literal
`first_last_frame`.

- A semantic reference controls only declared identity, scene, topology,
  blocking, region, material, style, or control geometry. It is not `t0`.
- A first frame owns literal `t0` only. From `t0+1`, the Prompt and temporal
  plan own action, performance, camera, physics, timing, and exit state.
- First/last frames own two compatible boundaries, never the transitions.
- A local crop needs an accepted whole-scene or Director region locator.
- An annotation derivative may carry circles, regions, paths, pivots, arrows,
  focus, or timing only in a Provider-supported semantic-reference route. Its
  IDs, directions, regions, and time windows must match the Prompt. It can
  never become Authority, a clean state carrier, or a first/last frame.
- Image and Prompt facts must not conflict. Declare `preserve`, `replace`,
  `complete`, `ignore`, `styleOnly`, `temporalRole`, `controls`, and
  `doesNotControl` for every positive payload image.
- Include only selected and pixel-reviewed storyboard media as positive visual
  context. Keep rejected or unreviewed pixels only as named negative examples.

For every medium/high motion Shot, persist one gap-free `temporalMotionPlan`
covering `t0` through `tEnd`. Track every moving subject, prop, camera, and
environment element with ordered phases, positions/orientations, paths,
interpolation, velocity/acceleration, contact evolution, action phase,
screen direction, occlusion, and endpoint. Prose time ranges without connected
state transitions are insufficient.

Treat focus as a numeric time-varying camera state. Any rack focus or changing
focus distance needs endpoint-complete focus states, targets, interpolation,
and agreement between Shot and GenerationUnit. Camera movement also needs a
structured path/orientation/lens/motion-envelope plan; camera adjectives alone
are not executable.

For every moving-camera shot, materialize that plan in Director Stage as a
typed `camera` route with ordered points, timestamps, look-at or orientation,
and a stable route ID. Every camera snapshot used for the shot must bind the
route ID, and the Director editor must render the route as a visible line or
arrow overlay. A clean capture without a visible route is not proof of a camera
plan. If the Provider supports semantic references, derive a separate
`provider_reference_only` annotated image from the clean capture and bind the
same `controlGeometryId` and route direction. Never paint the route onto a
clean Authority, first frame, last frame, or continuity carrier.

## Route professional capability

Build the smallest `TeamManifest` that covers actual risks. Always retain
production orchestration, director judgment, Prompt compilation, and
continuity; add performance, cinematography, editing, action, sound, lighting,
color, VFX, design, costume, music, advertising, or documentary fact roles as
needed.

Every accepted `ProfessionalContribution` must bind the current target and
source revisions, approved TeamManifest, at least one applicable `cap-*`
capability, at least one source-backed `kn-*` atom, selected method,
applicability boundary, concrete field changes, hard constraints, visible
acceptance checks, and an empty `vetoFindings` list. A contribution becomes
stale when any covered Story, Shot, GenerationUnit, Authority, Previs, context,
or TeamManifest revision changes. Advice, chat text, document paths, or a
production-wide memo do not satisfy a current shot gate.

External review may diagnose and challenge at Story, Shot, pre-dispatch plan,
rough-cut, or final-delivery gates. It may not persist production state,
approve creative work, compile the final Prompt, call a Provider, edit,
render, or publish. Translate accepted findings into formal current
contributions.

Resolve conflicts in this order: Owner hard requirements; locked Story and
dialogue; accepted identity/scene/prop pixels; approved Shot; accepted Sequence
Previs/CutDecision; VisualBible; current specialist contribution; sourced
knowledge; model optimization.

## Compile and preflight deterministically

Compile from structured inputs, never by concatenating independent specialist
prompts. First persist a Prompt Draft containing the source revision digest,
ordered prompt sections, effective reference manifest, motion/camera contract,
negative constraints, and model parameters. Then lint and preflight that exact
Draft; the Provider request is a deterministic projection of the Draft, not a
new prompt invented at dispatch time. Keep duration, resolution, aspect ratio,
model, count, audio flags, and Provider settings in `GenerationParameters`, not
content prose. Requested image dimensions are Provider parameters; persist
requested and actual sizes and judge usable composition against the documented
delivery ceiling.

The envelope must retain exact revision lineage for Story, Shots, Authorities,
storyboards, Director captures, Sequence Previs, VisualContextBundle,
professional contributions, evaluations, reviews, references, and model
registry. Provider payload order determines reference numbering. Strip runtime
IDs and internal audit prose from visible image/video content.

Run contract validation, Prompt lint, reference conflict checks, camera/focus/
temporal audits, current-review checks, Sequence Previs audit, model capability
preflight, and byte/reference limits before dispatch. The cinematic workflow
does not require a project budget, budget grant, reservation, or per-task spend
approval. A high score,
model-capability pass, old ACCEPT, or manual Prompt edit cannot override a hard
gate. A manual edit creates a new version and repeats all checks.

## Execute only through UnunuTV

Invoke `ununu-unutv-operator` and the official `unutv` CLI/API for every
project, canvas, node, contract, asset, media, review, run, timeline, render,
and UI verification operation. Never write SQLite directly. The
operator receives a compiled envelope; it must not redesign the Shot.

Keep external workflows, including ComfyUI graphs, as source evidence only.
Do not copy their runtime, checkpoints, custom nodes, or assumptions into the
active production path.

The cinematic workflow dispatches the configured Provider automatically after
the exact GenerationUnit preflight passes; there is no budget dialog or paid
approval step in this path. Confirm the production binds the intended script,
then prove Story, Shot, Previs, current visual context, reference roles,
professional signoffs, continuity, and Provider capability before execution.
An HTTP success alone is not creative success.

## Use the executable workflow manifest, not chat memory

When an Owner asks for a one-shot or end-to-end short film, create a
`UnunuCinematicWorkflowManifest` through the `workflow cinematic-start` CLI
command or `POST /api/projects/:projectId/cinematic-workflow/start`. The
manifest is persisted in the AutomationRun configuration and is the handoff
contract for any AI agent, not a suggestion stored only in this document. It
must carry the Skill id/version, production and source-node IDs, target
duration, canonical 13-stage order, semantic-reference policy, the
`preflight_then_auto_dispatch` execution boundary, and `provider_account`
billing mode (Provider account billing is outside UnunuTV project state).

At workflow start the runtime must load and hash this Skill and the three
mandatory reference documents into `skillContext`, then persist an
`UnunuCinematicAgentContextV1` index in the manifest. That index is the
Agent's machine-readable memory of the current Story, VisualBible, Authorities,
Shots, Storyboards, GenerationUnits, Evaluations, and Timelines. A chat summary
or canvas screenshot is not context. Every automation advance refreshes the
index; if its Skill hash or current artifact revisions are absent, the run is
invalid and must stop before any Provider call.

"One click" means one orchestration request that advances the persisted DAG
with an indexed context packet; it does not mean one Provider request or one
giant Prompt. The orchestration may pause at a creative gate only when the
context packet names the missing artifact and its exact completion condition.
It must never silently invent a Story, Shot, reference image, or Prompt. Use
`workflow cinematic-status` or `GET /api/projects/:projectId/cinematic-workflow/status`
to resume from persisted stage/task state. Never use direct `node run` for a
production-bound image/video/audio node; compile and preflight a GenerationUnit
first. Direct node runs remain only for explicitly isolated `direct` experiments.

The manifest is intentionally provider-neutral: a model adapter may change,
but the state machine, reference roles, timing contracts, actual-take memory,
continuation handoff, review precedence, and auto-dispatch boundary do not. A
different AI can operate the workflow only after loading this Skill and using
the UnunuTV CLI/API; it cannot honestly promise perfect output without accepted
assets, complete prompts, real media review, and Provider-specific validation.

## Review actual screen time and update canon

Run `dense-video-analysis` on every real candidate's complete timeline, reusing
an existing checksum-matched analysis pack. Persist exact run/media/checksum,
actual duration/FPS/audio, phase samples, plan-versus-actual observations,
internal cuts, usable ranges, actual start/end state, continuity breaks,
scores, visible entity checks, vetoes, decision, responsibility, and repair in
`VisualTakeMemory` and `CinematicEvaluationRecord`.

Only the latest evaluation per GenerationUnit authorizes reuse. A later Owner
REJECT revokes an older ACCEPT and every dependent first frame, reference,
context, compilation, and continuation. `ACCEPT` requires every blocking
visible check to pass and no veto. Never average conflicting decisions.

Reconcile only accepted observed facts into canon. The next unit compiles from
the latest accepted actual `carryForwardState`, not its planned endpoint or
chat memory. Choose exactly one retake action—reroll, rewrite one source
variable, reanchor, edit a separately reviewed usable range, or keep/fix in
post—and record the reason and alternative in `CreativeDecisionTrace`.

For a Provider duration ceiling, use explicit `TAIL_CONTINUE`,
`DUPLICATE_HANDOFF`, or a motivated cut. Continue only from a latest accepted
tail. Overlap uses distinct H0/H1 from the same accepted take, reproduces H0→H1
once, then advances beyond H1; trim the repeated region from actual motion
evidence. Preserve blocking, props, light, action phase, screen direction,
camera/lens/focus/exposure, and ambient audio across the seam. Never apply a
universal overlap duration.

## Preserve Owner authority

Only the Owner approves creative taste, TeamManifest, current revisions,
candidates, asset promotion, publication, and destructive deletion. Provider
dispatch itself is not a second money gate: after creative contracts pass and
preflight is ready, UnunuTV dispatches through the configured Provider account.
Pause when a choice changes locked Story, accepted Authority, or release state.
Preserve rejected evidence for audit, but never let it remain a
positive reference or current visual state.

## Mandatory final-reference manifest gate (before every Provider dispatch)

The compiled envelope, the canvas node, and the Provider request are one
auditable manifest. A run is blocked unless all three contain the same ordered
`mediaId` list, checksum/version, role, and semantic/temporal responsibility.
The canvas must render that exact effective list, including derived storyboard
composition, scene/blocking, and camera-guide references; showing only assets
found in the library is not a valid projection. Every prompt placeholder
`参考图N` must resolve to the same `providerIndex=N` binding. `first_frame` and
`first_last_frame` are mutually exclusive with ordinary image references.

A selected storyboard image is the current composition source, not an excuse
to keep an older composition board. Any non-current composition/keyframe media
in the effective Provider list is a hard `stale_storyboard_composition_reference`
failure; a selected storyboard image absent from the list is a hard
`selected_storyboard_reference_missing` failure. A structurally valid old
checksum is still stale. When appearance, anatomy, scene layout, or blocking
changes, generate and pixel-review a new media asset, bind it, recompile, and
show its checksum before dispatch; changing only text is not asset regeneration.

The run boundary must persist a rich prompt document containing every effective
reference and an immutable `cinematicReferenceAudit`. If the prompt document,
canvas payload, compilation, or Provider parameters diverge, fail closed before
calling a Provider. `preflight.ready=true` means only that this manifest may
enter the boundary; it is not visual acceptance. Use the official UnunuTV
CLI/API for the audit and mutation; never repair this state in the browser or
SQLite.
