# Generation and full-timeline review

## Submission

Before creating a formal production run:

1. Resolve the exact production, GenerationUnit, Prompt compilation, execution
   node, provider/model, parameters, and reference bindings.
2. Confirm every reference's role and control boundary.
3. For remote providers, publish required local media as signed expiring URLs
   through the configured HTTPS tunnel.
4. Require Prompt lint and exact provider capability preflight; record
   degradation rather than pretending an unsupported first/last-frame or
   reference mode works.
5. Dispatch with `billingMode: "provider_account"` after preflight is ready.
   There is no separate spend/paid-approval gate and no project budget step.
6. Link the run to GenerationUnit and compilation, poll when asynchronous, and
   verify local media materialization on success.

Never retry a Provider request blindly. Inspect existing run state and use a
stable request identity when supported.

## Candidate is not acceptance

Keep these objects separate:

```text
artistic shot, generation unit, provider segment, and compiled envelope
raw generated candidate
full-timeline observation
plan/actual differences
accepted usable interval
actual exit state and retained authority scope
```

Review every candidate that may be accepted, cut, assembled, or inherited:

1. Bind exact run/media identity, checksum, duration, frame rate, and audio.
2. Review the complete timeline with risk-adaptive frame density. Increase
   density around contact, fast action, hidden cuts, effects, and drift.
3. Record actual opening, trigger, motion phases, camera behavior, audio events,
   internal cuts, repeats/freezes, and ending state.
4. Compare each planned responsibility to observable output. Mark unobservable
   facts rather than guessing.
5. Record exact usable range, cut-in/out points, retained authority scope, and
   ACCEPT/PARTIAL/REJECT.
6. Pass only the accepted actual cut-out state downstream.

Prompt timestamps are plans, not edit points. Cut on actual movement, contact,
occlusion, or audio phase.

## Separate gates

Assess independently:

- identity and look;
- spatial topology and camera continuity;
- character/action mechanics, contact, and weight;
- prop and effect state;
- performance and dialogue;
- audio;
- pacing and editability.

“Space stable” does not mean “action successful”. A partial result must have a
nonempty retained scope and exact usable interval.

## Hard stops

Do not accept or assemble when:

- media identity, checksum, duration, or audio status is unknown;
- the complete timeline was not reviewed;
- judgment comes only from title, prompt, cover image, or first/last frame;
- cut points still use planned seconds instead of observed phases;
- a partial failure lacks retained scope;
- downstream continuity is about to inherit a planned rather than accepted
  actual exit.

When the platform lacks a structured field, keep the observation as a real run
artifact tied to exact media and state its persistence scope. Never invent an
API field or claim database persistence that does not exist.
