# Single-Canvas Header Design QA

source visual truth paths:

- `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/single-canvas-header/source-add-canvas.png`
- `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/single-canvas-header/source-workflow-tabs.png`

implementation screenshot path: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/single-canvas-header/post-fix.png`

viewport: 1280×720

state: `体育生和魔法师` / 主画布 / 20% / dark theme

full-view comparison evidence: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/single-canvas-header/post-fix.png`

focused region comparison evidence: no extra crop needed; both source images are focused header crops and the implementation full view keeps the center header readable.

## Findings

- No actionable P0/P1/P2 difference remains for this requested slice.
- The `＋画布` control is absent and only the project's single `主画布` tab remains.
- `创作画布 / 剪辑预览 / 成片审阅` is absent; the canvas opens directly as the normal creation surface.
- Typography, spacing, coral active state, charcoal tokens and existing canvas media remain unchanged.
- No image assets were introduced or replaced.
- The running API rejects a second canvas with HTTP 409 and `single_canvas_project`; existing project data was not deleted.

## Interaction Evidence

- In-app browser reports one `.scene-canvas-tab`, zero `.scene-create-button`, and zero `.workflow-tabs`.
- The existing top-right `导出检查` opens its real workflow panel directly rather than switching a removed display mode.
- `npm run verify` passes 12/12 tests, architecture boundaries and production build.

## Comparison History

- Earlier P1: the center header exposed a second-canvas creation path that contradicted the one-project/one-canvas product rule.
- Earlier P1: three workflow display modes made the canvas look like multiple top-level workspaces instead of one normal canvas.
- Fix: removed both UI groups and enforced the single-canvas invariant in the core application API.
- Post-fix evidence: `post-fix.png` shows one centered `主画布` tab and no second header row.

final result: passed

---

# Paid Generation Modal Design QA

source visual truth path: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/paid-run-modal/pre-fix.png`

implementation screenshot path: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/paid-run-modal/post-fix.png`

state: `官方号第2条-上铺多了一个人` / 主画布 / 20% / 图片节点 / GPT Image 2 / before paid submission

## Findings

- The browser-native confirmation was replaced by an in-product modal using the existing charcoal/coral UnuTV tokens.
- The modal visibly lists node, Provider, model, parameters, reference count and the exact Prompt before payment approval.
- Cancel closes without issuing a provider request. Confirm transitions through submitting/running/succeeded/failed states and keeps the Provider response visible.
- The selected image model now resolves to the registered `ununu` image adapter instead of the previous `Unknown or disabled provider: ununu` failure.
- Visual comparison found no P0/P1/P2 issue in the modal state; the dialog is centered, uncropped and readable at the owner viewport.

## Interaction Evidence

- In-app browser found exactly one modal with accessible name `确认付费生成` and no native browser confirmation.
- Provider Settings shows `Ununu Image` as configured; credential plaintext never enters the browser response.
- `npm run verify` passes 12/12 tests, architecture boundaries and the production build.
- Automated adapter coverage includes JSON image generation, multipart image edit with local reference media, HTTP run persistence, and generated-media retrieval.
- Live paid generation was intentionally not triggered by automated QA.

final result: passed

---

# Canvas Text Node Overflow Design QA

source visual truth path: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/text-node-overflow/pre-fix-owner.png`

implementation screenshot path: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/text-node-overflow/post-fix-full.png`

viewport: owner crop 450×618; implementation browser viewport 1280×720, focused to the same L03 script-node region

state: `官方号第2条-上铺多了一个人` / 主画布 / 20% / `L03 已验收｜可拍剧本《上铺多了一个人》60秒 v2`

full-view comparison evidence: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/text-node-overflow/post-fix-full.png`

focused region comparison evidence: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv/docs/evidence/text-node-overflow/before-after.png`

## Findings

- No actionable P0/P1/P2 difference remains in this overflow slice.
- Fonts and typography: the node keeps the legacy font, weight, size, line height and centered hierarchy; the full screenplay is no longer painted as preview copy.
- Spacing and layout rhythm: the icon, `短剧脚本` label and one-line helper remain vertically centered inside the original node bounds at 20%.
- Colors and visual tokens: the existing charcoal/coral UnuTV tokens are unchanged.
- Image quality and asset fidelity: this surface contains no raster asset; real neighboring canvas media and edges remain unchanged.
- Copy and content: the full screenplay remains persisted in the formal Prompt/Script data path and is available in the workspace; the collapsed canvas node now uses the original concise helper copy. Migrated L01/L02/L04 text artifacts also read their legacy Prompt bodies as display fallback instead of appearing empty, while new text edits continue to write the formal text field.

## Interaction Evidence

- Reloaded the same local project and retained the 20% viewport.
- The L03 canvas preview contains `在节点下方输入故事、人物与镜头要求` and no longer renders `# L03 可拍剧本` or its long screenplay body.
- The L01 text node visibly restores its 1,220-character source document inside its own scrollable node bounds.
- Long summaries are accepted only up to 180 characters in collapsed generic previews; the preview container additionally clips and line-clamps defensive overflow.
- Fresh browser reload reports no warning or error entries.
- `npm run verify` passes: 9/9 tests, architecture boundary check, and production build.

## Comparison History

- Earlier P1: the migrated L03 script node passed its complete Markdown screenplay into the centered collapsed preview. Because the legacy node shell allows handles outside its bounds, the large preview painted above and below the card.
- Fix: collapsed script/director nodes no longer fall back to full Prompt bodies; only concise summaries are accepted. The preview region now owns clipping and a five-line maximum as a defensive boundary.
- Post-fix evidence: `before-after.png` shows the same project and 20% canvas state with the screenplay fully contained and the original compact node hierarchy restored.

final result: passed
