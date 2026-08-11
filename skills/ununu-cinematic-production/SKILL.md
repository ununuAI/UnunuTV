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

For the current Owner-locked Seedance Mini production profile, resolution is
not a quality ladder:

- every Seedance 2.0 Mini request is exactly `480p`; never select, compile,
  submit or silently upgrade to `720p` or `1080p`;
- the 9:16 main timeline and final delivery raster are `480×854` at `24fps`;
- the final delivery codec is H.264 with AAC stereo audio;
- generation, timeline, render and delivery QC must all show this same 480p
  contract. A higher-resolution intermediate or export is a blocker, not an
  acceptable upscale.

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

Read
[director-toonflow-openmontage-absorption.md](references/director-toonflow-openmontage-absorption.md)
when starting a new film/episode, repairing a workflow, deciding stage
ownership, or building editing/delivery state. It defines the one merged
workflow; never expose Director Skill, Toonflow, OpenMontage and UnuTV as four
parallel production paths.

Treat the referenced Director Skill workflow as the minimum production
semantics:

1. `01/01b` develops and writes the complete exact script.
2. `02` diagnoses that exact revision with evidence; diagnosis is not approval.
3. The exact revised script returns to `02`; `03` then audits every dialogue
   line and performance beat.
4. `05` establishes stable reusable asset identity and reference duties.
5. `04` turns the locked script into complete executable shot language.
6. `06` compiles only the Provider-facing prompt for the selected model.
7. `07` designs music, ambience, Foley, silence and rights after a real rough
   timeline exists.

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
2. **Diagnose and lock story**: store exact source facts, dialogue, causal
   events, character objective/resistance/subtext, reveal order, entrance/exit
   state and Owner locks. Before Owner acceptance, persist three evidence-bound
   current-revision contributions: `script_doctor`, `dialogue_editor`, and
   `platform_editor`. The script doctor must cover causal chain, character
   objective/resistance, conflict progression, information reveal and
   production feasibility. Dialogue review must inventory every line and cover
   voiceprint, subtext, conflict drive, genre voice, information efficiency,
   rhythm and memorable line, including characters-per-second risk. Platform
   review must cover 3/15/30-second progression, cadence and ending hook.
   Score-only review, generic praise, stale revision evidence or unresolved
   vetoes block `script_analysis`.
3. **Build visual rules**: define format, camera grammar, motivated light,
   palette, production design, sound and VFX physics.
4. **Build reusable authority**: create only risk-relevant character, scene,
   prop, costume and voice assets; inspect actual pixels and promote accepted
   versions. Reuse accepted authority before generating new assets.

   Generate every candidate from its visible Authority/project-asset canvas
   node. Do not generate outside UnuTV and import the result afterward. For
   Ununu `openai/gpt-image-2`, keep technical controls in parameters:
   `n=1`, `background=opaque`, and the locked 1K raster. Character appearance
   boards use `1536x1024`; vertical scene/prop boards use `1024x1536`.
   The Provider payload field is `size`, not the video-only `resolution`
   field. A persisted internal `resolution` control must be translated to the
   exact Provider `size` value before dispatch; `size=auto` is forbidden for
   locked production images. Aspect ratio, raster, model, count, quality,
   background mode and output format belong to parameters, never Prompt prose.
   Put only observable visual content in the structured Prompt. Character and
   prop Prompts request a flat `#D2D2CE` background as a visual convention,
   but background shade is not an identity or continuity source. Core must
   preserve the Provider subject pixels and must never rewrite a light garment,
   body edge or prop merely to force an exact backdrop color. If the Provider
   returns a transposed or otherwise wrong raster, that payload must not be
   admitted directly. The Provider adapter may materialize a separately
   traceable `authority_fixed_1k_v1` derivative by proportionally containing
   the complete image on the locked
   raster with `#D2D2CE` fill; it must record actual/expected dimensions and
   may not crop, stretch, rotate, repaint or call the derivative an untouched
   Provider image. The normalized derivative is still only a candidate and
   requires fresh full-frame Owner review. This recovery applies only to
   isolated character/prop boards. A scene must be natively composed in the
   requested orientation: its Prompt describes observable vertical spatial
   depth while parameters carry the raster; a landscape scene inside portrait
   padding is rejected. Never request
   `transparent` from `gpt-image-2`, never put
   aspect ratio/resolution/model IDs into Prompt text, and never accept a
   wrong-size payload directly as Authority.

   Before Provider dispatch, the project-asset execution node must persist
   `generationStatus=running`, the current phase, model, raster, count,
   compilation and request trace. When Authority and project-asset history are
   collapsed into one canonical card, that live execution state must remain
   visible on the same card as an indeterminate loading surface. Canvas polling
   must reveal it while the request is active; a background-only request with
   no visible loading state is a production UI blocker. Do not create a second
   node or duplicate request to make progress visible.

   Storyboard keyframes follow the same rule per Shot. Before dispatch, persist
   one deterministic reference plan on that Shot's existing image execution
   node and draw every `cinematic_reference:<role>` edge. Reference order is:
   current accepted Director previs, exact character appearance authority,
   current scene authority, then only props explicitly present in that Shot.
   Director reference 1 must be a visible, clean `image/png` frame at
   `864×1536` (9:16), derived from the current Director composition with exact
   source-node/media/checksum lineage. A landscape `960×540` SVG control sheet,
   or any frame containing grids, arrows, labels, route overlays or timing
   text, is editor evidence only and must never enter the Provider image list.
   When a group Shot exceeds the Provider reference limit, first compose the
   current accepted character Authority images into one visible Grid node and
   use that traceable ensemble board; never randomly omit a person or reuse
   another Shot's references. The final per-Shot media order, checksums,
   source-node IDs, Authority revisions, PromptDocument and payload hash must
   all be visible before Provider dispatch. A queued/running/failed/stale item
   updates the same execution node; it never creates a duplicate progress card.
   Before the first paid call of a batch, materialize this full PromptDocument,
   the locked `size=1024x1536`, `background=opaque`, `n=1`, request trace and
   typed edges for every non-imported queued Shot—not only the first Shot being
   submitted. If any queued Prompt cannot be persisted, stop before creating a
   Run and leave that exact canvas node visibly blocked. Imported-media reuse
   may proceed without fabricating a PromptDocument.

   A Character Authority has exactly one canonical read model keyed by
   `authorityId`. Project assets and nodes are retained only as candidate media
   and immutable history; never present them as a second character Authority.
   Read the aggregate endpoint before showing or binding a character card. A
   formal identity source exists only when `currentAccepted` and
   `formalSourceBinding` bind the current Authority revision, current asset
   version, media ID and checksum.

   A controlled Character Authority media ACCEPT must include structured Owner
   pixel evidence. A real uploaded/verified identity derivative uses
   `owner_full_frame_pixel_v1`. When the accepted Authority already binds an
   Ark `virtual_person_asset`, a newly generated image is never allowed to
   claim that it was derived from the asset ID: the ID alone owns face
   identity, while the image is an `appearance_authority` for wardrobe, hair,
   makeup, body proportion, silhouette and clean-reference duties and uses
   `owner_character_appearance_pixel_v1`. `reviewerRole` must be `owner`,
   `reviewMode` must be `full_frame_pixel`, `fullFrameCoverage` must be true,
   and every check belonging to that evidence type must be `pass`. Appearance
   evidence must declare `faceIdentityDuty=external_virtual_person_asset` and
   bind the exact virtual-person ID without pretending the pixels came from
   it. Bind the exact target media/checksum, asset/version and Character
   Authority/revision. Free-text `note`, legacy ACCEPT rows and missing
   evidence are history only and never formal. The latest review wins; a later
   REJECT immediately revokes the earlier ACCEPT.

   Scene and prop Authority media use `owner_asset_pixel_v1`, bound to the
   exact current media/checksum, asset version and Authority revision. Scene
   checks cover topology, scale, materials, fixed anchors, lighting and
   reference cleanliness. Prop checks cover geometry, scale, material, wear,
   interaction readiness and reference cleanliness. Legacy note-only ACCEPT
   rows remain history and cannot release `asset_design`.
5. **Design Shot Intent**: define narrative job, opening/trigger/action/reaction/
   ending state, blocking, performance, camera purpose, light, sound, physics,
   edit boundary and visible acceptance checks. A structured script row becomes
   a generation segment only after it has a scene ID, beat ID, explicit shot
   boundary reason, 4–15 second duration, opening/end/handoff states, blocking,
   lighting, performance, constraints and exact focal length, aperture, focus,
   camera placement, composition and movement path. Do not derive shot count
   from source line count, a fixed template or an old episode. Three equal
   durations in a row require a new rhythm decision; dialogue over six
   characters per second must be split or returned to dialogue review.

   Every Shot must also carry a continuous second-by-second performance
   timeline before `shot_design` may complete. Use at least three contiguous
   timed beats that cover the exact Shot duration from `0` to `tEnd`:
   pre-trigger/initial resistance, visible state change or decision, and
   recovery/end handoff. Each beat must state the character's current
   judgment/goal/restraint and observable evidence such as breathing, gaze,
   hands, weight shift, contact or timed reaction. Repeated emotion labels,
   copied prose, gaps, overlaps or leaving the middle for the model to invent
   are blockers. If a later authoring repair changes structured rows, requeue
   `shot_design` and every downstream stage; never let old Shots, Previs,
   storyboard images or paid video continue under the previous row contract.
6. **Create low-poly previs**: stage scene zones, actor routes and camera route;
   preview 2.5D top-down, editor view, camera POV and start/end frames; play the
   timed motion and accept the exact revision.
7. **Compile sequence context**: create a playable `SequencePrevisDocument`,
   one `CutDecision` for every boundary and one current
   `VisualContextBundle` for every Shot.
8. **Choose reference mode**: use exactly one supported shape:
   `text_to_video`, semantic `image_reference`, literal `first_frame`, or
   literal `first_last_frame`. Bind exact media/checksum and responsibility.
   Ordinary identity/scene/prop/control images are semantic references, never
   implicit `t0`. Use literal first frame only for an accepted exact opening
   state, first/last only when both accepted endpoints must be reached, and
   previous accepted tail only for a true same-scene continuation. Use
   duplicate handoff only with verified H0/H1 overlap and trim evidence.
   Annotated arrows/text are editor-only control and can never become temporal
   first/last pixels. A later unit in the same scene must remain
   `waiting_for_previous_accept` until the immediately previous unit has a
   current ACCEPT observation and canon reconciliation.
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
  → continuity_qa
  → timeline_edit
  → sound_design
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

If `shot_design` returns `cinematic_shot_formation_required`, execute the
persisted `author_episode` nextAction through `cinematic-author`. Only a
revision of the same authoring `packageId` may restructure its rows at this
gate, including splitting, merging, reordering or renumbering them. Re-author
the complete package with the same exact target duration. The repair package
must pass complete shot-formation validation before StoryPacket, VisualBible
or any row is persisted; a failed repair changes nothing. Do not apply this
repair-only validation to initial screenplay scene blocks, and never use
script-row primitives or a new package as a hidden reset.

For this repair, use the exact structured-script target, screenplay revision,
content checksum and `repairContract` returned by nextAction. Copy that
contract unchanged into the same `EpisodeAuthoringPackageV1`; its revision
must also equal `sourceDocument.expectedRevision`. Do not guess authority
identity from prose or stale local files.

Shot-formation repair may never revise screenplay content, StoryPacket
authority, Owner locks, character identity/virtual-person lineage or
VisualBible. To revise the complete screenplay, first execute the explicit
persisted `workflow cinematic-revise-screenplay` command with the current
screenplay document id, revision and checksum plus a reason. Copy its returned
`screenplayRevisionContract` unchanged into the next complete
`EpisodeAuthoringPackageV1`. That development authoring may revise the
screenplay and StoryPacket while preserving the current VisualBible and rows;
the official screenplay save then invalidates derived state and requires all
three current-revision development reviews again. Never use a repair contract,
production reset or direct row mutation as a screenplay rewrite.

Asset derivation must be executable before Shot creation. Scene authority
names come from an explicit scene asset requirement or the VisualBible
production-design location, never from the dramatic `scenePurpose` sentence.
Key prop authorities come from `StoryPacket.assetRequirements.props`,
`StoryPacket.props` or named `VisualBible.propSemantics`; Shot blocking may
add later requirements but must not be the only prop source. Every character,
scene and key prop authority still needs a current real media version and an
explicit pixel-level ACCEPT before `shot_design`.

Every authority-backed canvas asset must also project complete typed metadata,
not only a picture and an authority ID. The Skill must derive and persist:

- `character → assetType: character`;
- `scene → assetType: scene_location`;
- `prop → assetType: prop`;
- a non-empty `assetDescription` compiled from the current authority contract;
- the current `authorityType`, `authorityDisplayName`, `authorityId` and
  `authorityRevision`.

If a scene or prop renders as a character asset, if a character-only voice
control appears on a non-character asset, or if the description/typed
parameters are empty, stop at `asset_design`, repair the shared UnuTV
projection policy, refresh every affected canvas node through the official
Skill API and add a regression test. Never treat this as a one-project data
patch.

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

Owner acceptance of Sequence Previs requires a server-owned complete-playback
receipt from the current exact revision. Play the visible Director Console
from `0` to `duration` without manual seek, then persist the observed session:

```bash
node apps/cli/src/index.mjs sequence-previs playback-receipt \
  --project PROJECT --production PRODUCTION --previs PREVIS \
  --data '{"playbackSessionId":"SESSION","startedAt":"ISO","completedAt":"ISO","sampleCount":2881,"maxObservedStepMs":42,"manualSeekCount":0,"intervals":[{"startSeconds":0,"endSeconds":120}]}'
node apps/cli/src/index.mjs sequence-previs review \
  --project PROJECT --production PRODUCTION --previs PREVIS \
  --revision REVISION --state accepted \
  --data '{"playbackReceiptId":"PLAYBACK_RECEIPT_ID"}'
```

Do not invent this receipt from planned duration, a screenshot, a seeked
preview or elapsed chat time. The `playbackReceiptId` returned by the first
command is mandatory for `accepted`; rejection does not require one.

An accepted Sequence Previs is reusable only when its complete ordered
`shotId + shotRevision` set still equals the current Shot set. Any structured
row repair or Shot revision change invalidates Previs and every downstream
image, Prompt, video, timeline, sound, render and delivery stage. The next
official advance must requeue `previs_design`; an old accepted review or
playback receipt can never authorize a newer Shot revision.

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

## Character voice and source-audio repair law

Treat every speaking character's voice as an Authority asset, never as a
per-shot TTS parameter. Before producing dialogue, every lead, support,
featured and speaking background character must have one accepted
`CharacterVoiceProfile` bound to the visible character asset node. The profile
must lock:

- stable `voiceProfileId`, current character Authority revision and, for
  generated dialogue, a real Provider `speakerId`;
- apparent age, timbre, pitch range, pace, breath pattern, articulation,
  accent and permitted emotional range;
- a clean 2–5 second captured reference when available, acceptance criteria,
  prohibited drift and repeatable continuity checks.

`reference_only` means only that a voice sample was captured. It must never be
presented as a cloned or stable generated voice. Generated dialogue requires
an accepted `provider_voice` or `provider_clone` binding. Every rendered line
must bind its character Authority and voice profile and pass four checks:
exact transcript, voice identity, performance intention and lip/time sync.
Main and supporting roles do not receive exceptions.

Native video audio is a source, not an automatic final mix. After the accepted
rough cut exists, audit every video clip's dialogue, ambience, Foley/noise and
music. If the source is correct, record `accepted` plus full-playback evidence.
If any layer is wrong:

1. Use the official audio-separation command. Never split left/right channels
   and call that dialogue/background separation.
2. Project the original mix and every algorithmic stem as linked audio nodes
   with `candidate` review state.
3. Listen to every stem. Separation output is evidence, not automatic truth.
4. Generate or record only the incorrect dialogue, ambience, Foley or music
   layer, using the accepted role/scene Authority.
5. Replace only that layer, create a new remix media artifact, connect all
   inputs to the visible sound-control node and play the whole repaired range.
6. Mark the source `repaired` only when separation evidence, replacements,
   remix media and full-playback verification are all current.

Use:

```bash
node apps/cli/src/index.mjs media separate-audio \
  --project PROJECT --media SOURCE_MEDIA --node SOURCE_VIDEO_NODE
```

The default compatible engine is Python Demucs in dialogue/background
candidate mode. `ffmpeg` extracts and remixes media but is not a source
separator. The similarly named npm package is not an approved separation
engine, and Homebrew currently has no Demucs formula. Configure a compatible
engine with `UNUTV_AUDIO_SEPARATOR_PATH`; when none is available, stop with
`audio_separator_unavailable` rather than fabricating stems.

On macOS, verify `command -v demucs` before installing anything. Demucs is a
Python tool, not the unrelated npm package and not a Homebrew formula. The
approved isolated installation is:

```bash
brew install uv
uv tool install --with numpy demucs
```

The explicit NumPy addition is required by Demucs 4.1.0 at runtime even though
its published package metadata omits it. After installation, run one
non-production smoke separation and confirm both `vocals.wav` and
`no_vocals.wav` exist before declaring the capability available.

The `sound_designer` contribution must target the current rough timeline
revision and persist `voiceCasting`, per-line `dialogueChecks`,
`sourceAudioAudit`, the five-layer plan (dialogue, ambience, Foley, music,
silence), cue sheet, rights evidence and required media IDs. Adding it creates
or updates the visible `cinematic_sound_design_plan` review node. Sound design
cannot pass while any source remains `repair_required`, any speaking role has
no accepted voice Authority, or any repaired mix is missing complete playback
verification.

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
