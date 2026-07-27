task_id: 20260718-director-stage-parity
goal: Restore the legacy UnuTV 3D director console and its durable SQLite data flow without inventing replacement UI.
done_when: A migrated director node opens the legacy console with its original stage data; edits, panorama import, save, and camera export persist through the local application API; same-state browser checks pass.
scope: apps/web director workspace, apps/api media/director controllers, core media/director use-cases, local-runtime media/project adapters, legacy migration repair, focused tests. Non-goals: Prompt, script, edge, zoom, and unrelated canvas parity in this slice.
verify: npm test; npm run verify:arch; npm run build; API probes against the migrated sports project; old/new same-state screenshots and primary director-console interactions in the in-app browser.
status: accepted
evidence: npm test -> 9 passed; npm run build -> passed; API probe -> revision 42 / 90 objects / 46 routes / 36 cameras; repair rerun -> 0; browser comparison -> docs/evidence/director-stage/old-new-director-console.png; design-qa.md -> passed.
