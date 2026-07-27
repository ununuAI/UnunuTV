# UnuTV Local Architecture

## Source of truth

Each local project owns one SQLite database and one media directory. The
database stores relations, revisions, payload JSON, run evidence, and relative
media paths. Binary media never lives in SQLite.

Remote providers receive expiring HMAC-signed `/provider-media/` URLs through a
user-configured public HTTPS tunnel. This bridge publishes access to a local
file; it is not cloud project storage and the local file stays authoritative.

## Cinematic production model

The canonical domain is documented in [cinematic/01-overview.md](cinematic/01-overview.md).

`StoryProductionPacket`, `VisualBible`, `CharacterAuthoritySet`,
`SceneAuthoritySet`, `PropAuthoritySpec`, `CinematicShotSpec`, `GenerationUnit`,
`ReferenceBinding`, `CinematicImagePromptEnvelopeV2`, `CinematicPromptEnvelopeV2`, and
`CinematicEvaluationRecord` are separate versioned resources. The runtime does
not store an entire production in one document JSON. Existing L01-L08 workflow
layers remain optional evidence records, not the active production contract.

The top-level `ununu-cinematic-production` skill owns creative orchestration
and deterministic Prompt compilation. `ununu-unutv-operator` owns only local
execution. Storyboards are optional, and one GenerationUnit may contain one or
multiple artistic shots.
Asset authority is separately risk-routed and optional. UnunuTV is the only
active execution runtime; external node-graph workflow files are evidence, not
runtime dependencies or Provider adapters.

## Effects

Core use-cases depend on ports. Local adapters own SQLite and filesystem IO.
HTTP and CLI controllers translate input and delegate. Web views call only the
local API adapter.

## Provider boundary

Model execution is behind a provider port. A missing provider must produce an
explicit blocked run. No paid or remote provider call is made implicitly.

OpenRouter video, Ark Seedance, and Ark TTS adapters dispatch through the
configured Provider account. There is no separate spend/paid-approval request
flag. Async video receipts are persisted in SQLite, polled through the same
application API, then downloaded atomically into `media/generated`. Base64
reference payloads remain in memory and are replaced by media IDs in durable
request summaries.

Provider credentials are an independent local state adapter under the resolved
data root's `secrets/` directory. The application API exposes only configured
status and source; provider adapters request a fresh effective environment for
every submit or poll so settings changes apply without process restart.

Exact video capability profiles live in the contracts package and are exposed
by `/api/model-capabilities`. Formal production runs require a current compiled
envelope plus successful lint and capability preflight; they then auto-dispatch
with `billingMode: "provider_account"`.
