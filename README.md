# UnunuTV

UnunuTV is a single-user, local-first **platform production OS** for cinematic
and multi-episode short-drama work. Operate it visually, through CLI/API, or
via the thin `ununu-video` Skill remote control.

```text
local Skill (ununu-video) / Codex
        │
        ▼
CLI / HTTP  →  Orchestrator + Workers  →  contracts / Knowledge Port / Series
        │              │
        ▼              ▼
   compile/preflight/run (formal GenerationUnit only for production video)
        │
        ▼
   SQLite + local media + provider ports
```

## Platform OS (v1)

- **Single entry**: `skills/ununu-video` → `workflow cinematic-start|status|advance|owner-decide`
- **Single next step**: every status returns machine-readable `nextAction`
- **Single formal video path**: GenerationUnit compile → preflight → run (no storyboard batch masquerading as formal)
- **Real knowledge**: Knowledge Port over `统一知识库` cap-*/kn-*; fake IDs fail closed
- **Multi-episode**: Series + SharedAssetLibrary + ContinuityLedger; Ep2+ bind accepted assets; freeze blocks silent reface

```bash
# Full short-drama product path on EXISTING stack
# (角色像素 → 分镜图 → image_reference 多镜视频 → 系列 promote → 画布逐步可见)
node apps/cli/src/index.mjs workflow short-drama \
  --brief "角色：林夏。开场。冲突。钩子。" \
  --title "第1集" \
  --duration 60 \
  --dry-run

# Real multi-shot formal video (GenerationUnit compile/preflight/run)
node apps/cli/src/index.mjs workflow short-drama \
  --brief "…" --title "第1集" --duration 60

npm run dev   # inspect progressive canvas + cinematic workspace + automation
```

Plan: `docs/progress/general/20260723-unutv-ultimate-platform-os-plan.md`

Next runs the browser UI and local API in one process. SQLite stores structured
state; image, video, and audio bytes stay in the project media folders.

## Scope

The product owns story facts, project VisualBibles, risk-routed character/scene/prop authority, cinematic shot design,
one-or-many-shot generation units, optional visual anchors, deterministic
Prompt compilation, video inputs, generation, spatial direction, timelines,
professional review, and export. It supports films, shorts, series,
commercials, MV, documentaries, animation, trailers, social video, and short
drama. It does not own account,
team, cloud-project, website, presentation, or generic design capabilities.

Supported canvas node kinds:

```text
text image audio video script storyboard video-clip director
```

Groups, assets, reviews, panoramas, workflow layers, and timelines are typed
resources rather than extra generic node kinds.

The active cinematic architecture and contracts are documented in
[docs/cinematic/01-overview.md](docs/cinematic/01-overview.md). Content Prompt
and Provider parameters are separate. Storyboards are optional, and a single
generation request may contain multiple designed artistic shots.
Character, scene, prop, and storyboard image Prompts use deterministic V2
compilers. UnunuTV remains the only execution runtime; ComfyUI is not required
or integrated.

## Paths

- Source: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv`
- Default runtime data: `/Users/<user>/.unutv`
- Override runtime data: `UNUTV_DATA_DIR=/absolute/path`

Runtime layout:

```text
.unutv/
  catalog.sqlite
  secrets/                       # directory mode 0700
    {ark,openrouter,openspeech}-* # file mode 0600
  projects/project-<uuid>/
    project.sqlite
    .unutv/project.json
    media/source/{images,videos,audio}
    media/generated/{images,videos,audio}
    media/{thumbnails,proxies}
    {temp,exports,backups}
```

## Commands

```bash
npm install
npm test
npm run verify
npm run dev
node apps/cli/src/index.mjs --help
```

The full-stack development server uses one local address:
`http://127.0.0.1:4318`. `npm run dev:api` remains available only for isolated
HTTP API debugging.

## Public tunnel references for Ark

Media is not copied to an imaginary cloud library. UnunuTV signs an expiring
local `/provider-media/` URL, and the user's existing HTTPS tunnel makes that
URL readable by Ark or another remote generation provider.

The normal `npm run dev` and `npm run start` commands start the already-installed
Cloudflare Quick Tunnel automatically. Its random hostname is detected and
injected into the running publisher, so no tunnel name needs to be copied
manually:

```bash
npm run start
```

Pure loopback startup is deliberately named `npm run start:local-only` (or
`npm run dev:local-only`) and should only be used for isolated debugging.

Only signed `/provider-media/` requests are accepted through the public host.
The Next UI and `/api/` project endpoints remain loopback-only.

```bash
UNUTV_PUBLIC_MEDIA_BASE_URL="https://a-fixed-tunnel.example" npm run dev
ununu-unutv media publish --project PROJECT_ID --media MEDIA_ID --provider ark
```

The signing secret is created at
`~/.unutv/runtime/provider-media.secret` with mode `0600`. An expired tunnel or
URL never removes the local source file.

## Video and voice providers

Supported local adapters:

- `openrouter`: HappyHorse video jobs with first-frame and continuity images;
- `ark`: Seedance video jobs with tunnel-published image/video/audio references;
- `openspeech`: Doubao Seed Audio dialogue, narration, and sound generation;
- `ark-tts`: optional Ark-compatible speech endpoint.

Credentials can be saved from the local Settings panel into
`~/.unutv/secrets/`. The directory uses mode `0700`, each credential file uses
mode `0600`, and plaintext values are never returned by the API or written into
a project database. Environment variables remain supported and take
precedence. Formal cinematic work dispatches through the configured Provider
account after preflight; there is no separate spend/paid-approval gate.

```bash
OPENROUTER_API_KEY="..." npm run dev
ARK_API_KEY="..." UNUTV_PUBLIC_MEDIA_BASE_URL="https://your-tunnel.example" npm run dev
OPENSPEECH_API_KEY="..." OPENSPEECH_SPEAKER_ID="..." npm run dev

ununu-unutv node run --project PROJECT_ID --node NODE_ID \
  --request '{"prompt":"..."}'
ununu-unutv run poll --project PROJECT_ID --run RUN_ID
ununu-unutv production create --project PROJECT_ID --data '{"projectType":"short_film"}'
ununu-unutv unit compile --project PROJECT_ID --production PRODUCTION_ID --unit UNIT_ID
ununu-unutv unit preflight --project PROJECT_ID --production PRODUCTION_ID --unit UNIT_ID
ununu-unutv authority list --project PROJECT_ID --production PRODUCTION_ID
ununu-unutv authority compile --project PROJECT_ID --production PRODUCTION_ID --authority AUTHORITY_ID --data '{"generationParameters":{"provider":"ununu","model":"openai/gpt-image-2","aspectRatio":"16:9","resolution":"2048x1152","count":1,"referenceMediaIds":[]}}'
```

Provider request bodies containing base64 reference media are used only in
memory. SQLite keeps media IDs and a compact request summary, not giant encoded
images.

The development CLI command is `ununu-unutv`; it deliberately does not invoke
or depend on any pre-existing command installed elsewhere on the machine.
