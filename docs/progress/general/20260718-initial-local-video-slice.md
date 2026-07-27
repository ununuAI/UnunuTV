task_id: 20260718-initial-local-video-slice
goal: Build a new standalone single-user local UnuTV video workbench.
done_when: CLI, API, SQLite, media, minimal Web canvas, Director, Panorama, L01-L08, and Timeline state pass end-to-end verification.
scope: Only /Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv; no paid providers, login, cloud storage, or destructive legacy cleanup.
verify: npm run verify plus CLI and API end-to-end tests using an isolated temporary data root.
status: complete
evidence: npm test passes 6 end-to-end tests including Ark tunnel references, Seedance polling/download, OpenRouter first-frame generation, and Ark TTS materialization; architecture scan passes; Next 16 production build passes; npm audit reports 0 vulnerabilities; production full-stack smoke returned page and health API; CLI created a project against the same SQLite; browser smoke created a Director node, rendered WebGL blocking, saved stage v1, and reported no console errors.
next: configure the current HTTPS tunnel and provider environment variables, then perform one separately owner-approved low-cost live smoke for each provider.
