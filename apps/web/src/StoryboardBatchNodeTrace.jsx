import { storyboardBatchNodeTrace } from "./storyboard-batch-node-view-model.js";

export function StoryboardBatchNodeTrace({ node }) {
  const trace = storyboardBatchNodeTrace(node);
  if (!trace) return null;
  return (
    <section aria-label="故事板生成请求轨迹" className={`storyboard-batch-node-trace is-${trace.status}`}>
      <header><strong>{trace.statusLabel}</strong><span>{[trace.model, trace.raster, trace.aspectRatio].filter(Boolean).join(" · ")}</span></header>
      {trace.message ? <p>{trace.message}</p> : null}
      {trace.errorCode ? <p className="is-error"><b>{trace.errorCode}</b>{trace.errorMessage ? ` · ${trace.errorMessage}` : ""}</p> : null}
      <dl>
        <div><dt>batch</dt><dd title={trace.jobId}>{trace.compactJobId}</dd></div>
        <div><dt>item</dt><dd title={trace.itemId}>{trace.compactItemId}</dd></div>
        {trace.runId ? <div><dt>run</dt><dd title={trace.runId}>{trace.compactRunId}</dd></div> : null}
        {trace.requestId ? <div><dt>request</dt><dd title={trace.requestId}>{trace.compactRequestId}</dd></div> : null}
      </dl>
    </section>
  );
}
