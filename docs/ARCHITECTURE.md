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

The single `ununu-cinematic-production` Skill owns creative orchestration,
low-poly previs, deterministic Prompt compilation and the official CLI/API
execution protocol. Storyboards are optional, and one GenerationUnit may
contain one or multiple artistic shots. Every durable production object and
artifact has a visible canvas-node projection; there is no operator Skill or
hidden second state system.
Agents are execution clients of that Skill, not independent workflow authors.
The manifest fixes stage order and canvas/agent policy. Prompt compilation
persists the complete Prompt on its execution node and resolves each required
reference to a typed incoming canvas edge; formal dispatch re-audits the live
Prompt and graph so a removed edge or hidden reference fails closed.
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
configured Provider account. Image exploration has no spend gate. Formal video
requires accepted low-cost proof, an exact preflight and a revision-bound
single-submission intent; it does not require a separate billing popup. Async
video receipts are persisted in SQLite, polled through the same
application API, then downloaded atomically into `media/generated`. Base64
reference payloads remain in memory and are replaced by media IDs in durable
request summaries.

Provider credentials are an independent local state adapter under the resolved
data root's `secrets/` directory. The application API exposes only configured
status and source; provider adapters request a fresh effective environment for
every submit or poll so settings changes apply without process restart.

Exact video capability profiles live in the contracts package and are exposed
by `/api/model-capabilities`. Formal production runs require a current compiled
envelope, successful lint/capability preflight, accepted previs and an exact
formal-generation intent. They use `billingMode: "provider_account"` and a
stable idempotency key.
