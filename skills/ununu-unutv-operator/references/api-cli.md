# UnunuTV API and CLI

## Boundary

```text
source: /Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv
data:   /Users/zhangxiaohao/.unutv
API:    http://127.0.0.1:4318
CLI:    node /Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/apps/cli/src/index.mjs
```

The API is loopback-only. Only signed `/provider-media/` URLs may cross the
HTTPS tunnel. Resolve canonical `project-<uuid>` IDs before acting.

```bash
curl -fsS http://127.0.0.1:4318/api/health
node /Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/apps/cli/src/index.mjs project list
```

## CLI families

```text
project create|list|open|rename
canvas create|open
node add|update|delete|run
run poll
edge connect|delete
group create|add
media import|publish
asset create|list|version
production create|list|get|update
story get|save
bible get|save
authority list|get|save|update|route|compile
storyboard compile
shot list|add|update
unit list|create|update|compile|preflight|run
evaluation list|add
model capabilities
workflow get|set
director get|save
panorama get|set
review add
timeline create|get|add
settings status
serve
```

All commands return JSON. Run `apps/cli/src/index.mjs --help` for flags.

## Cinematic production routes

```text
GET/POST  /api/projects/:projectId/cinematic-productions
GET/PATCH /api/projects/:projectId/cinematic-productions/:productionId
GET/PUT   .../:productionId/story-packet
GET/PUT   .../:productionId/visual-bible
GET/POST  .../:productionId/asset-authorities
GET/PATCH .../:productionId/asset-authorities/:authorityId
POST      .../:productionId/asset-authorities/route-risk
POST      .../:productionId/asset-authorities/:authorityId/compile
POST      .../:productionId/storyboard-prompts/compile
GET/POST  .../:productionId/shots
GET/PATCH .../:productionId/shots/:shotId
GET/POST  .../:productionId/generation-units
GET/PATCH .../:productionId/generation-units/:generationUnitId
POST      .../:productionId/generation-units/:generationUnitId/compile
POST      .../:productionId/generation-units/:generationUnitId/preflight
POST      .../:productionId/generation-units/:generationUnitId/runs
GET/POST  .../:productionId/evaluations
GET/POST  .../:productionId/contributions
GET       /api/model-capabilities?capability=video
```

Formal cinematic run requires current compilation, preflight ready, and
`billingMode: "provider_account"`. There is no separate paid-approval or project
budget gate on this path. The removed V1 route returns 404 and must never be
used.

## Direct experiment and common routes

```text
GET/POST  /api/projects
GET/PATCH /api/projects/:projectId
POST      /api/projects/:projectId/canvases
GET       /api/projects/:projectId/canvases/:canvasId
POST      /api/projects/:projectId/canvases/:canvasId/nodes
PATCH/DELETE /api/projects/:projectId/nodes/:nodeId
GET/PUT   /api/projects/:projectId/nodes/:nodeId/prompt
GET       /api/projects/:projectId/scripts/:nodeId
POST/PATCH/DELETE script row routes
POST      /api/projects/:projectId/nodes/:nodeId/run
POST      /api/projects/:projectId/runs/:runId/poll
GET       /api/projects/:projectId/runs
POST/DELETE edge and group routes
POST/GET  media, asset, Director Stage, panorama, review, timeline routes
GET/PUT   /api/settings/providers
```

Direct node run remains for isolated experiments. Formal cinematic production
must run through GenerationUnit.

## Verification

After every mutation, re-read the affected resource and validate semantic
fields, not only HTTP status. Reopen the database/runtime for persistence tests.
Never edit `catalog.sqlite` or `project.sqlite` manually.
