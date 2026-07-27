# UnuTV Local Development Guide

This repository is the standalone local-first UnuTV video production product.

## Product boundary

- Single user and local only.
- Video production only.
- No login, team, cloud project storage, web-page generation, PPT, or generic design modules.
- Runtime data belongs under the resolved `.unutv` data root, never in source directories.
- Do not import or reference unrelated product code, paths, credentials, APIs, or vocabulary.
- Do not copy whole directories from any legacy repository; migrate one verified behavior at a time.

## Architecture boundary

- `packages/contracts`: public data and command contracts only.
- `packages/core`: pure policies and use-cases; no filesystem, SQLite, HTTP, UI, or provider SDK imports.
- `packages/local-runtime`: local SQLite, media filesystem, and composition adapters.
- `apps/api`: thin HTTP controller.
- `apps/cli`: thin CLI controller for Codex and local automation.
- `apps/web`: local visual review and interaction surface.

Every durable action must be available through the core application API before it is wired into the Web UI.
