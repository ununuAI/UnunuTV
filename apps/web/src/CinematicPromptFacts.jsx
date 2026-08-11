"use client";

export function CinematicPromptFacts({ facts }) {
  if (!facts) return null;
  return <section className={`cinematic-prompt-facts${facts.ok ? " is-ready" : " is-blocked"}`} aria-label="电影 Prompt 编译事实">
    <header><strong>电影 Prompt 编译事实</strong><span>{facts.ok ? "已具体化" : "阻塞"}</span></header>
    {facts.labels.length ? <div className="cinematic-prompt-intent">
      <b>抽象词</b><span>{facts.labels.join("、")}</span><small>仅作意图标签；Provider 使用下方具体条款</small>
    </div> : null}
    {facts.providerClauses.length ? <div className="cinematic-prompt-clauses">
      {facts.providerClauses.map((clause, index) => <p key={`${index}:${clause}`}>{clause}</p>)}
    </div> : null}
    {facts.promptMode ? <div className="cinematic-prompt-mode"><b>编译模式</b><span>{facts.promptMode.code || "未命名"}{facts.promptMode.reason ? ` · ${facts.promptMode.reason}` : ""}</span></div> : null}
    {facts.directorFields.length ? <details>
      <summary>导演 11 项结构化字段 · {facts.directorFields.length}</summary>
      <div className="cinematic-prompt-director-fields">
        {facts.directorFields.map((field) => <article key={field.field}><b>{field.label}</b>
          {field.clauses.map((clause, index) => <p key={`${field.field}:${index}`}>{clause.text}{clause.sourcePath ? <small>{clause.sourcePath}</small> : null}</p>)}
        </article>)}
      </div>
    </details> : null}
    {facts.providerAdapter ? <small className="cinematic-prompt-provider-facts">
      参考素材 {facts.providerAdapter.referenceCount ?? "?"}/{facts.providerAdapter.referenceLimit ?? "?"}
      {facts.providerAdapter.deterministicCompression ? " · 确定性压缩" : ""}
    </small> : null}
    {facts.errors.length ? <div className="cinematic-prompt-errors">
      {facts.errors.map((error, index) => <p key={`${error.code}:${index}`}><b>{error.code || "prompt_blocked"}</b>{error.message}</p>)}
    </div> : null}
  </section>;
}
