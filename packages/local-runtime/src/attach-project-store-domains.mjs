import { attachAutomationTaskMethods } from "./automation-task-adapter.mjs";
import { attachCinematicProductionMethods } from "./cinematic-production-adapter.mjs";
import { attachCinematicProductionResetMethods } from "./cinematic-production-reset-adapter.mjs";
import { attachCinematicSequenceWorkspaceMethods } from "./cinematic-sequence-workspace-adapter.mjs";
import { attachDirectorStageMethods } from "./director-stage-adapter.mjs";
import { attachProjectAssetMethods } from "./project-asset-adapter.mjs";
import { attachProjectBudgetMethods } from "./project-budget-adapter.mjs";
import { attachProjectControlMethods } from "./project-control-adapter.mjs";
import { attachProjectRenderMethods } from "./project-render-adapter.mjs";
import { attachProjectReviewMethods } from "./project-review-adapter.mjs";
import { attachProjectScriptMethods } from "./project-script-adapter.mjs";
import { attachProjectTimelineMethods } from "./project-timeline-adapter.mjs";
import { attachStoryboardMethods } from "./storyboard-adapter.mjs";

export function attachProjectStoreDomains(prototype, event, parse) {
  attachProjectScriptMethods(prototype, event);
  attachProjectAssetMethods(prototype, event, parse);
  attachCinematicProductionMethods(prototype, event);
  attachCinematicProductionResetMethods(prototype, event);
  attachProjectControlMethods(prototype, event);
  attachStoryboardMethods(prototype, event);
  attachProjectTimelineMethods(prototype, event);
  attachProjectBudgetMethods(prototype, event);
  attachAutomationTaskMethods(prototype, event);
  attachProjectRenderMethods(prototype, event);
  attachProjectReviewMethods(prototype, event, parse);
  attachDirectorStageMethods(prototype, event);
  attachCinematicSequenceWorkspaceMethods(prototype, event);
}
