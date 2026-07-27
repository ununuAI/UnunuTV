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
node apps/cli/src/index.mjs workflow cinematic-advance --project PROJECT
```

Use `workflow short-drama` only as an entry adapter to the same persisted
workflow. Follow returned `nextAction`; do not reconstruct the stage sequence
from chat memory.

For production nodes, the API/CLI call is valid only when it is the operation
named by the current Skill-driven `nextAction`. Do not use shell scripts,
direct database writes, browser clicks or free-form Agent prose as a hidden
authoring path.

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

Timeline rendering additionally requires `--output-node NODE`. The output node
must exist on the current canvas and have a compatible media kind.

Direct `node run` is allowed only for an explicitly isolated `direct`
experiment. A production-bound node must fail closed.

## Verification receipt

Record project/canvas/node IDs, exact revisions, media/checksum, compilation
hash, Provider run/idempotency status, evaluation, timeline, render/QC and
delivery IDs. Missing persistence or canvas projection is a blocker.
