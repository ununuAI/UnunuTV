import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const runtime = createLocalRuntime();
let repaired = 0;

try {
  const { projects } = await runtime.app.listProjects();
  for (const summary of projects) {
    const project = await runtime.app.openProject({ projectId: summary.id });
    for (const canvasSummary of project.canvases) {
      const canvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvasSummary.id });
      for (const node of canvas.nodes) {
        if (node.kind !== "director" || !node.payload?.directorStage) continue;
        const current = await runtime.app.getDirectorStage({ projectId: project.id, nodeId: node.id });
        if (current) continue;
        await runtime.app.saveDirectorStage({ projectId: project.id, nodeId: node.id, stage: node.payload.directorStage });
        repaired += 1;
        process.stdout.write(`repaired ${project.title} / ${node.title}\n`);
      }
    }
  }
  process.stdout.write(`director stages repaired: ${repaired}\n`);
} finally {
  runtime.close();
}
