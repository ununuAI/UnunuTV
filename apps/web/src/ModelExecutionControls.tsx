"use client";

import { ArrowUp, BrainCircuit, Check, ChevronDown, LayoutGrid, LoaderCircle, RectangleHorizontal, RectangleVertical, Sparkles, Square } from "lucide-react";
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ModelCapability, ModelExecutionSelection } from "./prompt-types";
import { listWorkbenchModels, type WorkbenchModelCatalog, type WorkbenchModelCatalogItem } from "./prompt-workbench-api";

interface ModelExecutionState {
  catalog?: WorkbenchModelCatalog;
  error?: string;
  externalBusy: boolean;
  selected: ModelExecutionSelection;
  submitting: boolean;
}

interface ModelExecutionContextValue {
  actions: {
    select: (selection: ModelExecutionSelection) => void;
    setParameter: (key: string, value: string | number | boolean) => void;
    submit: () => Promise<void>;
  };
  meta: {
    capability: ModelCapability;
  };
  state: ModelExecutionState;
}

const ModelExecutionContext = createContext<ModelExecutionContextValue | null>(null);

function useModelExecution() {
  const value = use(ModelExecutionContext);
  if (!value) throw new Error("ModelExecutionControls must be used inside ModelExecutionControls.Provider");
  return value;
}

function modelLabel(modelId: string) {
  if (modelId === "openai/gpt-image-2") return "GPT Image 2";
  if (modelId === "google/gemini-3.1-flash-image-preview") return "Nano Banana 2";
  return modelId.split("/").at(-1) ?? modelId;
}

function parameterDefaults(model?: WorkbenchModelCatalogItem) {
  return Object.fromEntries((model?.parameterControls ?? []).map((control) => [control.key, control.defaultValue]));
}

function sameParameters(left: ModelExecutionSelection["parameters"], right: ModelExecutionSelection["parameters"]) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function Provider({
  busy = false,
  capability,
  children,
  initialSelection,
  onSelectionChange,
  onSubmit
}: {
  busy?: boolean;
  capability: ModelCapability;
  children: ReactNode;
  initialSelection: ModelExecutionSelection;
  onSelectionChange?: (selection: ModelExecutionSelection) => Promise<void> | void;
  onSubmit: (selection: ModelExecutionSelection) => Promise<void> | void;
}) {
  const [catalog, setCatalog] = useState<WorkbenchModelCatalog>();
  const [selected, setSelected] = useState(initialSelection);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSelected((current) => {
      if (
        current.modelId === initialSelection.modelId
        && current.providerId === initialSelection.providerId
        && sameParameters(current.parameters, initialSelection.parameters)
      ) {
        return current;
      }
      const currentSize = current.parameters?.size;
      const currentCount = current.parameters?.n;
      const currentLooksDefault = (currentSize == null || currentSize === "auto") && (currentCount == null || currentCount === 1);
      const incomingHasExplicit = (
        (initialSelection.parameters?.size && initialSelection.parameters.size !== "auto")
        || initialSelection.parameters?.n === 4
      );
      if (currentLooksDefault && incomingHasExplicit) return initialSelection;
      return current;
    });
  }, [initialSelection.modelId, initialSelection.providerId, initialSelection.parameters?.n, initialSelection.parameters?.size, initialSelection.parameters?.quality, initialSelection.parameters?.background]);

  useEffect(() => {
    let active = true;
    void listWorkbenchModels(capability)
      .then((nextCatalog) => {
        if (!active) return;
        setCatalog(nextCatalog);
        const selectedModel = nextCatalog.models.find((model) => model.enabled && model.id === selected.modelId && model.providerId === selected.providerId);
        if (!selectedModel && nextCatalog.defaultSelection) {
          const defaultModel = nextCatalog.models.find((model) => model.id === nextCatalog.defaultSelection?.modelId && model.providerId === nextCatalog.defaultSelection?.providerId);
          setSelected({ ...nextCatalog.defaultSelection, parameters: parameterDefaults(defaultModel) });
        } else if (selectedModel) {
          const parameters = { ...parameterDefaults(selectedModel), ...(selected.parameters ?? {}) };
          if (!sameParameters(parameters, selected.parameters)) setSelected((current) => ({ ...current, parameters }));
        }
      })
      .catch((requestError: Error) => {
        if (active) setError(`模型目录加载失败：${requestError.message}`);
      });
    return () => {
      active = false;
    };
  }, [capability, selected.modelId, selected.providerId]);

  const value = useMemo<ModelExecutionContextValue>(() => ({
    actions: {
      select: (selection) => {
        const model = catalog?.models.find((candidate) => candidate.id === selection.modelId && candidate.providerId === selection.providerId);
        const next = { ...selection, parameters: parameterDefaults(model) };
        setSelected(next);
        void onSelectionChange?.(next);
        setError(undefined);
      },
      setParameter: (key, nextValue) => {
        setSelected((current) => {
          const next = { ...current, parameters: { ...(current.parameters ?? {}), [key]: nextValue } };
          void onSelectionChange?.(next);
          return next;
        });
        setError(undefined);
      },
      submit: async () => {
        if (busy || submitting) return;
        setSubmitting(true);
        setError(undefined);
        try {
          await onSubmit(selected);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "模型执行失败。");
        } finally {
          setSubmitting(false);
        }
      }
    },
    meta: { capability },
    state: { catalog, error, externalBusy: busy, selected, submitting }
  }), [busy, capability, catalog, error, onSelectionChange, onSubmit, selected, submitting]);

  return <ModelExecutionContext value={value}>{children}</ModelExecutionContext>;
}

function Parameters() {
  const { actions, state } = useModelExecution();
  const selectedModel = state.catalog?.models.find((model) => model.id === state.selected.modelId && model.providerId === state.selected.providerId);
  const controls = (selectedModel?.parameterControls ?? []).filter((control) => control.key !== "templateId");
  if (controls.length === 0) return null;

  const selectedLabel = (key: string) => {
    const control = controls.find((candidate) => candidate.key === key);
    const selectedValue = state.selected.parameters?.[key] ?? control?.defaultValue;
    return control?.options.find((option) => option.value === selectedValue)?.label;
  };
  const trigger = [selectedLabel("size"), selectedLabel("quality"), selectedLabel("n"), selectedLabel("background")].filter(Boolean).join(" · ");
  const parameterIcon = (key: string, value: string | number | boolean) => {
    if (key !== "size") return null;
    if (value === "1024x1024") return <Square aria-hidden="true" size={13} />;
    if (value === "1024x1536") return <RectangleVertical aria-hidden="true" size={13} />;
    if (value === "1536x1024") return <RectangleHorizontal aria-hidden="true" size={13} />;
    if (value === "3808x1904") return <RectangleHorizontal aria-hidden="true" size={13} />;
    return <Sparkles aria-hidden="true" size={13} />;
  };
  const sizeControl = controls.find((control) => control.key === "size");
  const selectedSize = state.selected.parameters?.size ?? sizeControl?.defaultValue ?? "auto";

  return (
    <details className="model-parameter-select">
      <summary aria-label="图片生成参数" className="generator-spec-pill model-parameter-trigger">
        {parameterIcon("size", selectedSize)}
        <span>{trigger}</span>
        <ChevronDown aria-hidden="true" size={12} />
      </summary>
      <div className="model-parameter-menu nowheel" onWheelCapture={(event) => event.stopPropagation()}>
        {controls.map((control) => (
          <section className="model-parameter-section" key={control.key}>
            <span>{control.label}</span>
            <div className={`model-parameter-options model-parameter-options-${control.key}`} role="group" aria-label={control.label}>
              {control.options.map((option) => {
                const active = (state.selected.parameters?.[control.key] ?? control.defaultValue) === option.value;
                return (
                  <button
                    aria-pressed={active}
                    className={active ? "active" : ""}
                    key={`${control.key}:${String(option.value)}`}
                    onClick={() => actions.setParameter(control.key, option.value)}
                    type="button"
                  >
                    {parameterIcon(control.key, option.value)}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}

function TemplateSelector() {
  const { actions, state } = useModelExecution();
  const selectedModel = state.catalog?.models.find((model) => model.id === state.selected.modelId && model.providerId === state.selected.providerId);
  const control = selectedModel?.parameterControls.find((candidate) => candidate.key === "templateId");
  if (!control) return null;
  const selectedValue = state.selected.parameters?.templateId ?? control.defaultValue;
  const selectedOption = control.options.find((option) => option.value === selectedValue) ?? control.options[0];

  return (
    <details className="image-template-select">
      <summary aria-label="选择图片生成预设" className="image-template-trigger">
        <LayoutGrid aria-hidden="true" size={14} />
        <span>{selectedOption?.label ?? "自由生成"}</span>
        <ChevronDown aria-hidden="true" size={12} />
      </summary>
      <div className="image-template-menu nowheel" role="listbox" aria-label="图片生成预设" onWheelCapture={(event) => event.stopPropagation()}>
        {control.options.map((option) => {
          const active = option.value === selectedValue;
          return (
            <button
              aria-selected={active}
              className={active ? "active" : ""}
              key={String(option.value)}
              onClick={(event) => {
                actions.setParameter(control.key, option.value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              role="option"
              type="button"
            >
              <LayoutGrid aria-hidden="true" size={14} />
              <span>{option.label}</span>
              {active ? <Check aria-hidden="true" size={13} /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { state } = useModelExecution();
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismissMenus = (event: PointerEvent) => {
      const frame = frameRef.current;
      if (!frame) return;
      const target = event.target instanceof Element ? event.target : null;
      const targetDetails = target?.closest("details");
      for (const details of frame.querySelectorAll("details[open]")) {
        if (targetDetails === details && frame.contains(target)) continue;
        details.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", dismissMenus);
    return () => document.removeEventListener("pointerdown", dismissMenus);
  }, []);
  return <div className={`generator-actions model-execution-frame copilotKitInputControls${state.externalBusy ? " is-busy" : ""}`} ref={frameRef}>{children}</div>;
}

function Selector() {
  const { actions, state } = useModelExecution();
  const selectedModel = state.catalog?.models.find((model) => model.id === state.selected.modelId && model.providerId === state.selected.providerId);
  const providers = state.catalog?.providers ?? [];

  function modelsForProvider(providerId: string): WorkbenchModelCatalogItem[] {
    return state.catalog?.models.filter((model) => model.providerId === providerId) ?? [];
  }

  return (
    <details className="generator-model-select model-control-select">
      <summary className="generator-model model-control-trigger" data-model={state.selected.modelId}>
        <BrainCircuit aria-hidden="true" className="model-provider-icon" size={15} />
        <span>{selectedModel?.label ?? modelLabel(state.selected.modelId)}</span>
        <ChevronDown size={12} />
      </summary>
      <div className="generator-model-menu model-control-menu nowheel" role="listbox" aria-label="选择模型 API" onWheelCapture={(event) => event.stopPropagation()}>
        {providers.map((provider) => {
          const providerModels = modelsForProvider(provider.id);
          return (
            <section className="model-provider-section" key={provider.id}>
              <div className="model-provider-heading">
                <span>{provider.label}</span>
                <small>{provider.configured ? "可用" : "待配置"}</small>
              </div>
              {providerModels.length > 0 ? providerModels.map((model) => {
                const active = model.id === state.selected.modelId && model.providerId === state.selected.providerId;
                return (
                  <button
                    aria-selected={active}
                    className={`model-option${active ? " active" : ""}`}
                    disabled={!model.enabled}
                    key={`${model.providerId}:${model.id}`}
                    onClick={(event) => {
                      actions.select({ modelId: model.id, providerId: model.providerId });
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                    role="option"
                    type="button"
                  >
                    <BrainCircuit aria-hidden="true" size={17} />
                    <span className="model-option-copy">
                      <strong>{model.label}</strong>
                      <small>{model.id}</small>
                    </span>
                    {active ? <Check aria-hidden="true" size={14} /> : null}
                  </button>
                );
              }) : (
                <button className="model-option model-option-unavailable" disabled type="button">
                  <BrainCircuit aria-hidden="true" size={17} />
                  <span className="model-option-copy">
                    <strong>{provider.label}</strong>
                    <small>{provider.note}</small>
                  </span>
                </button>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}

function Feedback() {
  const { state } = useModelExecution();
  return state.error ? <p className="model-execution-feedback" role="alert">{state.error}</p> : null;
}

function Spacer() {
  return <span className="generator-spacer" />;
}

function Submit({ disabled = false, title = "发布生成" }: { disabled?: boolean; title?: string }) {
  const { actions, state } = useModelExecution();
  const busy = state.externalBusy || state.submitting;
  return (
    <button
      aria-label={title}
      className="send-dot generator-send model-execution-submit"
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => void actions.submit()}
      title={title}
      type="button"
    >
      {busy ? <LoaderCircle aria-hidden="true" className="model-execution-spinner" size={14} /> : <ArrowUp aria-hidden="true" size={14} />}
    </button>
  );
}

export const ModelExecutionControls = { Feedback, Frame, Parameters, Provider, Selector, Spacer, Submit, TemplateSelector };
