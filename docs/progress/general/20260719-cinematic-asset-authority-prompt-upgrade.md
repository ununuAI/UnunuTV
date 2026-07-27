task_id: 20260719-cinematic-asset-authority-prompt-upgrade
goal: Convert the useful production concepts in Downloads/新的 into native UnunuTV contracts, deterministic image/video Prompt compilation, UI/API/CLI support, and safer unified-knowledge ingestion without adopting ComfyUI.
status: complete
scope: UnunuTV contracts/core/SQLite/API/CLI/Web UI, ununu-cinematic-production, ununu-unutv-operator, unified knowledge extraction/governance, and documentation. No paid generation and no ComfyUI integration.

implemented:
- Added optional risk-routed CharacterAuthoritySet, SceneAuthoritySet, PropAuthoritySpec, and shared AssetViewSpec contracts with normalized SQLite version history.
- Implemented ununu.character.v2, ununu.image.v2, and ununu.storyboard.v2 deterministic compilers, lint, lineage hashes, API/CLI endpoints, and the nine-stage CinematicProductionWorkspace.
- Strengthened VisualBible with visual motifs, color arc, spatial dramaturgy, prop semantics, costume narrative, material aging, cultural research references, and style prohibitions.
- Added a controlled Chinese cinematic field lexicon, capability-gated internal time slots, semantic byte compression with droppedFragments, and lint/warnings for unbound images, tool CLI arguments, hidden cuts, camera conflicts, unsupported time slots, hype stacks, absolute identity promises, and named style imitation.
- Kept UnunuTV as the only active execution runtime. ComfyUI workflow JSON remains source evidence only; no workflow profile, model path, custom node, adapter, or runtime dependency was added.
- Unified knowledge now aliases renamed files by SHA-256, detects UTF-8/GB18030, extracts XLSX by row/shared string, preserves long text through semantic segmentation, and audits legacy truncation/encoding/structure failures without deleting knowledge.
- The five exact duplicate Downloads/新的 files retained their existing source IDs and DECOMPOSED status; only aliasLocations were added. Seven unsafe legacy observations now require the original, and their source coverage is PARTIAL instead of false COMPLETE.

verification:
- UnunuTV npm run verify: 68/68 tests passed, architecture boundaries passed, and Next production build passed.
- Unified knowledge: typecheck passed; 34/34 active tests passed with one optional vector test skipped; 3/3 architecture tests passed.
- ununu-cinematic-production, ununu-unutv-operator, and ununu-unified-knowledge all passed quick_validate.
- Provider behavior was exercised only with mocks/no-cost contract tests. No paid request, publication, ComfyUI invocation, or destructive migration occurred.
