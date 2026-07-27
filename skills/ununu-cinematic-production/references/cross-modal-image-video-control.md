# Cross-modal image/video control gate

Use this reference whenever a production moves from text to images, from images
to video, between adjacent video segments, or from generated media into an edit.
It turns creative intent into inspectable state transitions. Do not dispatch a
Provider run until every applicable item is explicit and non-contradictory.
There is no separate spend/paid-approval gate.

## Enforce the dependency gate

Run the production in this order:

1. Audit and accept the exact current StoryPacket revision.
2. Audit the complete ordered Shot script against that StoryPacket and accept
   each exact current Shot revision.
3. Accept the exact Authority pixels needed by those Shots. Authority text,
   status, or an old review is not pixel evidence.
4. Decide the Provider input mode and assign one owner to every visual fact.
5. Create the storyboard, full-scene locator, action-phase board, Director
   blocking, or timed previs required by the declared risks.
6. Compile the Shot Prompt, dynamic contract, temporal-motion tracks, and edit
   handoff from those accepted inputs.
7. Run contract lint, capability preflight, conflict scans, and current-review
   gates.
8. When preflight is ready, dispatch through the configured Provider account.
   Do not ask for a separate spend/paid approval.
9. Review the real pixels or dense full timeline; then either accept, reject, or
   recover a separately reviewed usable range.

A later review overrides an earlier one. A high score never overrides a failed
identity, anatomy, count, origin, topology, blocking, spatial-direction, or Owner
veto check. Story or Shot failure invalidates downstream image/video planning;
do not repair an upstream semantic error with a more elaborate Prompt.

## Choose exactly one visual-input mode

| Mode | What the image owns | What the Prompt still owns | Hard rule |
| --- | --- | --- | --- |
| `text_to_video` / `NONE` | No literal external state | Identity description, world, event, time, motion, camera, end state | Do not promise exact external or cross-shot pixels. |
| `image_reference` | Only declared semantic facts such as identity, scene, topology, region, material, pose class, or control marks | Literal opening state unless declared, all later motion, timing, camera evolution, contact, performance, and exit state | The reference is not automatically `t0`. It may declare `preserve`, `replace`, `complete`, and `ignore`. |
| `first_frame` | The literal output state at `t0` | Every transition from `t0+1`, including subject/camera paths, timing, physics, and end state | Do not order the model to replace a visible table, face, prop, body state, or composition in the same first frame. |
| `first_last_frame` | Literal `t0` plus a literal endpoint | Every causal and physical transition between the endpoints | Compatible endpoints are not a motion plan. |

`image_reference`, `first_frame`, and `first_last_frame` are mutually exclusive
Provider request shapes unless the registered capability explicitly proves
otherwise. Never silently treat an ordinary reference, storyboard panel,
character sheet, scene master, or annotated guide as the first frame.

Select the mode from the Shot's actual priority:

- use text-to-video when motion/composition freedom dominates and exact external
  identity or entry-state matching is not required;
- use semantic `image_reference` when identity, scene, whole-to-local context,
  material, or control geometry must persist while the event differs from the
  reference pixels;
- use `first_frame` only when the exact initial or previous-tail pixels must be
  inherited;
- use `first_last_frame` only when both literal boundaries are accepted and
  compatible;
- when a frame-only Provider cannot also receive a needed full-scene locator,
  choose the priority honestly and design a bridge keyframe, occlusion seam, or
  editorial cut. Do not overload one image with incompatible roles.

## Bind every reference semantically

Every payload image needs an exact media ID, checksum, latest accepted review,
payload order, and a `ReferenceBinding` that declares:

- `preserve`: facts that must survive, such as character identity, set
  materials, room topology, furniture zones, crowd occupancy, costume, or prop
  design;
- `replace`: visible wrong facts and their exact replacements, such as a modern
  table becoming an ancient table;
- `complete`: absent, cropped, covered, or off-camera facts that must be
  reconstructed, such as bodies hidden by an occluder;
- `ignore`: visible facts that must not be inherited;
- `styleOnly`: palette, texture, era, lens, or lighting attributes that must not
  control content;
- `temporalRole`: `identity`, `static`, `initial`, `action_phase`, `endpoint`,
  `continuity`, or `style`;
- `controls` and `doesNotControl`: the exact responsibility boundary;
- the coordinate system, region IDs, and full-scene locator for every local
  crop or detail reference.

An ordinary reference may intentionally contain an unwanted or occluded fact
only when `replace`, `complete`, or `ignore` resolves it and the visible image,
Prompt, and annotation all describe one compatible world. A first frame may not
use that escape hatch because its pixels are the literal start state.

A local crop does not prove where it belongs. When the Shot is a detail,
close-up, insert, or partial body view, bind either an accepted full-scene master
or a Director coordinate/region locator that tells the model which whole, room
zone, body area, prop, or contact surface contains the crop. The local image
controls detail; the full-scene source controls placement. Neither source may
claim the other's role.

Before compilation, build a fact-ownership table with one row per required fact:

| Fact | Static source | Dynamic source | Visible acceptance check | Forbidden reading |
| --- | --- | --- | --- | --- |
| identity/anatomy | Authority or semantic reference | identity invariants in Prompt | same face/body/unique anatomy throughout | ordinary face, duplicate part, melted identity |
| scene/topology | Scene Authority, Director world, or locator | explicit caused deltas only | entrance, exit, furniture, levels, occupancy remain in named zones | reset, mirrored set, unexplained disappearance |
| blocking/contact | accepted frame or Director state | subject/prop tracks | facing, hands, gaze, contact, trajectories match | limb conflict, teleport, wrong origin |
| performance | accepted identity baseline only | causal performance beats | each threshold is visible at the declared time | emotion adjective, early leak, simultaneous symptoms |
| camera | accepted start composition or Director state | camera trajectory plan | position, orientation, lens, focus, speed, parallax, stop state | invented cut, reversed axis, unplanned orbit |
| seam | accepted prior exit pixels | continuation handoff | motion, light, sound, action phase conserve across edit | duplicated or skipped action |

If two sources own the same fact differently, preflight fails. Resolve the
source conflict before Prompt optimization.

## Use annotations as control evidence

Annotations are valid only for a Provider-supported semantic
`image_reference` route. They are useful for any spatial or camera instruction,
not only orbit shots. A derived control image may contain:

- regions or circles identifying a subject, prop, contact point, crop origin,
  reveal target, or replacement area;
- arrows or paths for dolly, truck, crane, boom, follow, orbit, pan/tilt,
  subject motion, gaze, weapon, projectile, or VFX trajectories;
- pivot, axis, look-at, safe-frame, focus, occlusion, and timing markers;
- labels that connect a region/path ID to one time window and one Prompt clause.

The clean source and annotated derivative must have separate media/checksum
lineage. Every mark needs a stable ID, coordinate space, meaning, start/end
time, and matching Prompt instruction. The annotation and Prompt must agree on
screen direction, path direction, target, timing, and region meaning. Marks are
control-only and must not appear in final pixels.

Never use an annotated derivative as Authority, storyboard acceptance media,
first frame, last frame, or clean continuity carrier. If a Provider does not
support annotated references, keep the marks `editor_only` and transfer their
structured geometry into Director and Prompt contracts instead.

## Require storyboard or timed previs by risk

A storyboard is not a decorative still gallery. It becomes mandatory when any
of these risks cannot be proved from accepted Authority plus structured
Director state alone:

- cross-shot character, crowd, furniture, entrance/exit, or damage placement;
- a local crop whose place in the whole scene is otherwise ambiguous;
- complex action pose, contact, VFX origin/trajectory, or exact-count reveal;
- a composition, eyeline, axis, screen direction, or edit boundary that needs
  Owner approval before generation;
- a semantic-reference image whose preserved/replaced/completed regions need
  visual confirmation.

Each panel must identify the linked Story/Shot revision, frozen time,
narrative job, subjects and named zones, facing/gaze/hands/props/contact,
camera/lens/focus, foreground/midground/background, source reference roles,
visible acceptance checks, and forbidden interpretations.

Still panels cannot prove duration, acceleration, contact evolution, camera and
subject relative velocity, or the movement created by adjacent frames. When
those are the unresolved risks, create a timed animatic or Director previs with
start, decisive midpoint, exit, continuous phase boundaries, and adjacent-state
transitions. Do not respond to a temporal problem by adding more unrelated
stills.

## Compile a complete Shot Prompt

Treat the reference image as the static evidence and the Shot Prompt as the
director of everything that changes. Precision is coverage plus causality, not
more adjectives. Build the Prompt from this deterministic pass:

1. Enumerate every visible subject, prop, environment anchor, effect, sound
   source, and camera.
2. Write the exact state of each at `t0`, every phase boundary, and `tEnd`.
3. Derive each transition: trigger, path, interpolation, speed/acceleration,
   contact evolution, consequence, and recovery.
4. Assign every fact to image evidence, Director geometry, Prompt dynamics, or
   the edit handoff. No fact may be ownerless or multiply owned in conflict.
5. Compile only Shot-local facts into the Provider Prompt.
6. Run positive coverage, negative counterexample, and image/text/annotation
   contradiction scans.

Every production video Prompt must make these domains observable:

- narrative task and exact opening state;
- identity, costume, defining anatomy, and irreversible state invariants;
- named scene zones, topology, subject placement, facing, gaze, hands, props,
  contacts, and screen direction;
- ordered time intervals and who acts first;
- subject, prop, projectile, VFX, and environmental trajectories;
- source -> carrier -> path -> impact -> reaction chains;
- performance objective, stimulus, decision, restraint, visible micro-actions,
  turning point, control break, and exit state;
- camera position, orientation, path, pivot/look-at, lens, focus, exposure,
  speed curve, parallax/occlusion, framing invariant, and stop state;
- action physics, weight transfer, collision, injury/fatigue, and recovery;
- motivated lighting, color, atmosphere, sound, and dialogue timing;
- final state plus the exact visual, motion, exposure, and sound handoff;
- forbidden mutations and the most likely wrong ordinary interpretations.

Focus changes require a numeric time curve, not only the word “拉焦”. Record
`focusDistanceMeters`, target, and interpolation at every meaningful Shot
boundary, including t0 and tEnd; mirror the same values onto the GenerationUnit
camera states. Validate each distance against the actual camera-to-target
geometry and the declared final image. A near-lens wipe whose end focus still
points at a distant background subject is a contract failure even when camera
position and FOV are correct.

For still-image prompts, freeze one instant. Do not include the full action
timeline, camera path, edit sequence, dialogue timeline, or several mutually
exclusive phases in one keyframe request.

## Author acting as visible causality

Do not write only “fearful,” “sad,” “furious,” or a list of facial anatomy.
Every performance contract needs:

- `initialState`, external `trigger`, internal objective/judgment/subtext, and
  restraint strategy;
- at least three continuous numeric beats covering the entire Shot;
- a perceptual sequence: stimulus -> eyes/attention -> confirmation/decision ->
  breath/local tension -> hands/weight/action -> result/recovery;
- a visible threshold where control breaks and explicit symptoms forbidden
  before that threshold;
- `turningPoint`, `endState`, and at least two shortcut interpretations to
  forbid.

Use evidence the shot scale can resolve. Close-ups may show eyelid pressure,
tear-film tension, nostril change, throat movement, jaw/lip compression, or
skin response. Medium/wide shots should favor gaze target, breath, shoulders,
hands, stance, foot pressure, center-of-gravity shift, and contact. Preserve
identity while expression changes. Dense review must check every declared
threshold, not only the final expression.

## Build temporal state, not sampled stills

A still is only `S(t0)`. Medium/high motion requires one continuous
`temporalMotionPlan` with a track for every moving subject, prop, camera, and
environmental element. Each track must cover `t0` through `tEnd` and specify:

- causally ordered phase intervals with no gaps, overlaps, or reversed cause;
- position/orientation state at every boundary;
- path, interpolation, velocity and acceleration curves;
- anticipation, contact, force transfer, reaction, follow-through, and recovery;
- contact acquisition/release and required intermediate states;
- screen direction, visibility/occlusion, and the verified endpoint.

Evaluation must inspect adjacent-frame displacement, orientation, velocity,
acceleration, contact, action phase, identity, and unplanned cuts. A correct
first and last frame cannot excuse teleportation, a reset, or a broken middle.

## Design continuation and long takes editorially

Provider duration ceilings do not create unlimited shots. Divide the sequence
into segments with real edit handles and choose one handoff mode:

- `TAIL_CONTINUE`: the latest still-valid accepted tail/H1 becomes the next
  literal first frame; the next segment begins after H1 and does not replay the
  prior action;
- `DUPLICATE_HANDOFF`: accepted H0 and H1 define a real repeated action window;
  the next segment reproduces H0 -> H1, then proceeds to unmistakably new
  content, and the repeated region is trimmed in the edit.

These modes are mutually exclusive. There is no universal overlap duration.
Persist the actual H0/H1 times and pixels, action phase, subject/prop states,
camera direction and speed, lens/focus/exposure, lighting, ambience, sync cue,
seam opportunity, cut rule, and trim plan. Check conservation of blocking,
props, lighting, action phase, screen direction, identity, damage, and sound.

Use accepted occlusion, foreground wipe, whip pan, motion blur, flash, dark
frame, or sound bridge only when the actual pixels and timeline contain that
opportunity. For high-spatial-risk action, prefer a chain of single artistic
shots with accepted boundaries over a Provider-invented internal cut. A
15-second limit is solved by designed segments and overlap handles, not by two
unrelated clips labeled as one long take.

## Diagnose failure before dispatching again

Classify the failure against the contract:

- `prompt_coverage_failure`: a required dynamic, spatial, identity, physics,
  performance, timing, or negative fact was absent or ambiguous;
- `reference_semantics_failure`: reference roles were undeclared, the model was
  asked to treat a semantic image as `t0`, or a local crop lacked a locator;
- `control_conflict`: image pixels, annotation, Director geometry, and Prompt
  demanded incompatible states or paths;
- `control_modality_failure`: a fully explicit text-only Prompt repeats the
  same topological escape, showing that structural reference/control is needed;
- `provider_capability_failure`: the registered mode, count, duration, guide,
  or resolution behavior cannot carry the intended contract;
- `temporal_or_edit_failure`: endpoints may be valid but intermediate motion,
  internal cuts, overlap, or the seam is unusable.

Do not answer every failure by adding synonyms or rerolling. Close a genuine
coverage gap once; if the same structural failure repeats, stop the same
text/model route and build Provider-supported structural evidence such as a
clean geometry proof, region/attachment map, annotated semantic reference, or
controllable render. Rejected pixels remain audit counterexamples only and
cannot become Authority, current reference, or a frame carrier.

Treat output dimensions separately from visible correctness. Persist requested
and actual dimensions. A Provider-normalized image around a 1K tier under its
registered sub-2K ceiling is not a failure merely because the requested string
was larger. Wrong identity, anatomy, topology, composition, or insufficient
usable detail remains a pixel failure at any resolution.

Keep ComfyUI and external node workflows outside the active UnunuTV production
runtime. They are useful only as source evidence for a missing, testable control
capability. Do not integrate a workflow merely because it exists. Any future
structural-control adapter requires its own architecture decision, capability
registration, contract mapping, tests, and Owner approval before it can affect
the production path.

## Complete preflight before auto-dispatch

All applicable answers must be yes before Provider dispatch. Passing preflight
is the dispatch gate; do not invent a second spend/paid-approval step:

- Are the exact current Story and every linked Shot revision Owner-accepted?
- Are every required Authority and keyframe pixels accepted for exact
  media/checksum, with no newer reject?
- Is exactly one Provider input mode selected and registered as supported?
- Does every image have a semantic role and fact-ownership boundary?
- Is any literal first/last frame free of Prompt instructions that contradict
  its visible pixels?
- Does every local crop have a whole-scene or Director locator?
- Do all annotation IDs, directions, regions, and times match the Prompt and
  remain control-only?
- Are storyboard and timed previs present when their risk triggers apply?
- Does the Prompt cover identity, space, blocking, dynamics, performance,
  camera, physics, timing, end state, handoff, and forbidden readings?
- Does every moving entity have a continuous temporal track with intermediate
  states and contact evolution?
- Does the seam use one explicit handoff mode with real accepted H0/H1 evidence?
- Do latest-review, hard-veto, lifecycle, signoff, and model-capability gates
  all pass independently?
- Has any repeated failure changed control modality instead of repeating the
  same failed configuration?
- Is `billingMode: "provider_account"` and the configured Provider credential
  ready, with no project-budget reservation required?
