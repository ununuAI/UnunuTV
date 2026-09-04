# UnunuTV

UnunuTV is a single-user, local-first **AI-video low-poly previs and shot-control
console** for cinematic and multi-episode short-drama work. Operate it through
the single `unutv` Skill and inspect every persisted stage
on the production canvas.

```text
unutv / Codex
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

- **Single entry**: `skills/unutv` → `workflow cinematic-start|status|advance|owner-decide`
- **Single next step**: every status returns machine-readable `nextAction`
- **Single formal video path**: accepted low-poly previs → GenerationUnit compile/preflight → exact formal-generation intent → idempotent run
- **Canvas-visible law**: every source, contract, request, candidate, render and delivery binds a visible node
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
compilers. UnunuTV remains the only execution runtime; supported local or
remote ComfyUI providers are optional execution backends.

## Install from GitHub in Codex

The repository publishes the `unutv` Skill through its `ununu-tv` marketplace:

```bash
codex plugin marketplace add ununuAI/UnunuTV --ref main
codex plugin add unutv@ununu-tv
```

Start a new Codex task after installation so the Skill is loaded.

## Run the local canvas on Windows

Install Node.js 26+, Git, FFmpeg, and Cloudflared. Then run in PowerShell:

```powershell
$UnunuTvRoot = "$env:LOCALAPPDATA\Ununu\ununu-unutv"
git clone https://github.com/ununuAI/UnunuTV.git $UnunuTvRoot
setx UNUTV_ROOT $UnunuTvRoot
npm.cmd --prefix $UnunuTvRoot ci
npm.cmd --prefix $UnunuTvRoot run build
npm.cmd --prefix $UnunuTvRoot run dev
```

Keep the final command running while using the canvas at
`http://127.0.0.1:4318`.

## Tunnels

- `npm run dev` and `npm run start` create a per-device Cloudflare Quick
  Tunnel automatically. Its random URL is not configuration and must not be
  copied from another computer or committed to Git.
- Only signed, expiring `/provider-media/` files cross that tunnel. The canvas
  UI and `/api/` remain loopback-only.
- AutoDL H3 uses its own API Token. It needs the media tunnel only when a run
  references local images, video, or audio; it does not need an SSH tunnel.
- Self-hosted H3 may use the operator's own SSH host, port, and private-key
  path to create a local port forward.
- FLUX uses local ComfyUI by default or a user-owned HTTPS gateway. This public
  repository contains no organization endpoint, Token, or reverse-tunnel
  topology.

## Update

Stop UnunuTV, then update the runtime and Skill from PowerShell:

```powershell
$UnunuTvRoot = "$env:LOCALAPPDATA\Ununu\ununu-unutv"
git -C $UnunuTvRoot pull --ff-only
npm.cmd --prefix $UnunuTvRoot ci
npm.cmd --prefix $UnunuTvRoot run build
codex plugin marketplace upgrade ununu-tv
codex plugin add unutv@ununu-tv
```

If Git reports local changes or a non-fast-forward update, stop and review the
differences instead of overwriting them. Start UnunuTV again and open a new
Codex task after the update.

The plugin update does not replace local canvas state. Keep `.unutv`, project
media, and credentials outside Git. Before publishing a Skill change, run
`npm run plugin:sync` so the runtime and plugin copies stay identical.

## Paths

- Source: `UNUTV_ROOT`; Windows default `%LOCALAPPDATA%\Ununu\ununu-unutv`, macOS/Linux default `~/.local/share/ununu-unutv`
- Default runtime data: `~/.unutv`
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
precedence. Image generation may iterate freely as a canvas-visible exploration
surface. Formal video dispatches through the configured Provider account only
after accepted low-cost proof, exact preflight and an auditable one-submission
generation intent. This is a production-safety gate, not a second billing UI.

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
