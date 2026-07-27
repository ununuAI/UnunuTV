"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AudioLines, Box, Image as ImageIcon, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type PromptToken = Record<string, any> & { type: "text" | "reference" | "skill" | "constraint" };
export type PromptDocumentV1 = { type: "doc"; version: 1; content: PromptToken[] };
export type PromptReferenceCandidate = {
  assetId?: string;
  assetVersionId?: string;
  key: string;
  label: string;
  mediaId?: string;
  referenceKind: string;
  sourceNodeId?: string;
  thumbnailUrl?: string;
};

const tokenAttrs = {
  id: { default: null }, label: { default: "" }, referenceKind: { default: "asset" }, assetId: { default: null },
  assetVersionId: { default: null }, mediaId: { default: null }, sourceNodeId: { default: null }, providerIndex: { default: null },
  role: { default: "reference" }, controls: { default: [] }, doesNotControl: { default: [] }, authorityRevision: { default: null },
  versionPolicy: { default: "pinned" }, thumbnailUrl: { default: null }, skillId: { default: null }, constraintId: { default: null }, severity: { default: "hard" }
};

function tokenIcon(kind: string) {
  if (kind === "image") return <ImageIcon size={13} />;
  if (kind === "video") return <Video size={13} />;
  if (kind === "audio") return <AudioLines size={13} />;
  return <Box size={13} />;
}

function renderAtomicTokenHTML(HTMLAttributes: Record<string, any>, tokenType: "reference" | "skill" | "constraint") {
  const kind = tokenType === "reference" ? HTMLAttributes.referenceKind : tokenType;
  const marker = tokenType === "skill" ? "✦" : tokenType === "constraint" ? "◆" : "▣";
  const icon = HTMLAttributes.thumbnailUrl
    ? ["img", { alt: "", src: HTMLAttributes.thumbnailUrl }]
    : ["span", { "aria-hidden": "true", class: "prompt-atomic-token-icon" }, marker];
  return [
    "span",
    mergeAttributes(HTMLAttributes, {
      class: `prompt-atomic-token token-${kind}`,
      contenteditable: "false",
      [`data-prompt-${tokenType}`]: "",
      "data-token-id": HTMLAttributes.id
    }),
    icon,
    ["span", {}, HTMLAttributes.label || ""]
  ];
}

const ReferenceToken = Node.create({
  name: "referenceToken", group: "inline", inline: true, atom: true, selectable: true,
  addAttributes: () => tokenAttrs,
  parseHTML: () => [{ tag: "span[data-prompt-reference]" }],
  renderHTML: ({ HTMLAttributes }) => renderAtomicTokenHTML(HTMLAttributes, "reference")
});

const SkillToken = Node.create({
  name: "skillToken", group: "inline", inline: true, atom: true, selectable: true,
  addAttributes: () => tokenAttrs,
  parseHTML: () => [{ tag: "span[data-prompt-skill]" }],
  renderHTML: ({ HTMLAttributes }) => renderAtomicTokenHTML(HTMLAttributes, "skill")
});

const ConstraintToken = Node.create({
  name: "constraintToken", group: "inline", inline: true, atom: true, selectable: true,
  addAttributes: () => tokenAttrs,
  parseHTML: () => [{ tag: "span[data-prompt-constraint]" }],
  renderHTML: ({ HTMLAttributes }) => renderAtomicTokenHTML(HTMLAttributes, "constraint")
});

function toTiptap(document: PromptDocumentV1, candidates: PromptReferenceCandidate[]) {
  const references = new Map(candidates.flatMap((candidate) => [candidate.mediaId, candidate.assetId, candidate.sourceNodeId].filter(Boolean).map((key) => [key, candidate])));
  const paragraphs: any[] = [{ type: "paragraph", content: [] }];
  const current = () => paragraphs[paragraphs.length - 1].content;
  for (const token of document?.content || []) {
    if (token.type === "text") {
      const parts = String(token.text || "").split("\n");
      parts.forEach((part, index) => {
        if (index) paragraphs.push({ type: "paragraph", content: [] });
        if (part) current().push({ type: "text", text: part });
      });
    } else if (token.type === "reference") {
      const candidate = references.get(token.mediaId) || references.get(token.assetId) || references.get(token.sourceNodeId);
      current().push({ type: "referenceToken", attrs: { ...token, thumbnailUrl: candidate?.thumbnailUrl || null } });
    } else if (token.type === "skill") current().push({ type: "skillToken", attrs: token });
    else if (token.type === "constraint") current().push({ type: "constraintToken", attrs: token });
  }
  return { type: "doc", content: paragraphs };
}

function fromTiptap(json: any): PromptDocumentV1 {
  const result: PromptToken[] = [];
  const pushText = (text: string) => {
    const last = result.at(-1);
    if (last?.type === "text") last.text += text;
    else result.push({ type: "text", text });
  };
  const paragraphs = json?.content || [];
  paragraphs.forEach((paragraph: any, paragraphIndex: number) => {
    if (paragraphIndex) pushText("\n");
    for (const node of paragraph.content || []) {
      if (node.type === "text") pushText(node.text || "");
      else if (node.type === "hardBreak") pushText("\n");
      else if (node.type === "referenceToken") {
        const { thumbnailUrl: _thumbnail, ...attrs } = node.attrs || {};
        result.push({ type: "reference", ...attrs });
      } else if (node.type === "skillToken") result.push({ type: "skill", ...node.attrs });
      else if (node.type === "constraintToken") result.push({ type: "constraint", ...node.attrs });
    }
  });
  return { type: "doc", version: 1, content: result.length ? result : [{ type: "text", text: "" }] };
}

function plainText(document: PromptDocumentV1) {
  let referenceIndex = 0;
  return document.content.map((token) => {
    if (token.type === "text") return token.text;
    if (token.type === "reference") { referenceIndex += 1; return `（参考媒体${token.providerIndex || referenceIndex}）`; }
    return token.type === "skill" ? `（启用能力：${token.label}）` : `（约束：${token.label}）`;
  }).join("");
}

export function PromptDocumentEditor({ candidates, document, onChange, onPlainTextChange, onSubmit, placeholder, readOnly }: {
  candidates: PromptReferenceCandidate[];
  document: PromptDocumentV1;
  onChange: (document: PromptDocumentV1) => void;
  onPlainTextChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  readOnly: boolean;
}) {
  const [mention, setMention] = useState<{ from: number; query: string; to: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const mentionRef = useRef(mention);
  const insertActiveRef = useRef<() => void>(() => {});
  const pendingRef = useRef<PromptDocumentV1 | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const userEditRef = useRef(false);
  const externalKey = JSON.stringify(document);
  mentionRef.current = mention;

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    content: toTiptap(document, candidates),
    extensions: [StarterKit, ReferenceToken, SkillToken, ConstraintToken, Placeholder.configure({ placeholder })],
    editorProps: {
      attributes: { class: "prompt-document-surface generator-input nowheel", "aria-label": "富 Prompt 编辑器" },
      handleKeyDown: (_view, event) => {
        if (!event.metaKey && !event.ctrlKey && !event.altKey) userEditRef.current = true;
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); onSubmit(); return true; }
        if (!mentionRef.current) return false;
        if (event.key === "Escape") { event.preventDefault(); setMention(null); return true; }
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((value) => value + 1); return true; }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)); return true; }
        if (event.key === "Enter") { event.preventDefault(); insertActiveRef.current(); return true; }
        return false;
      },
      handleTextInput: () => { userEditRef.current = true; return false; },
      handlePaste: () => { userEditRef.current = true; return false; },
      handleDrop: () => { userEditRef.current = true; return false; }
    },
    onUpdate: ({ editor: current }) => {
      if (!userEditRef.current) return;
      const nextDocument = fromTiptap(current.getJSON());
      onPlainTextChange(plainText(nextDocument));
      pendingRef.current = nextDocument;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => { if (pendingRef.current) onChange(pendingRef.current); pendingRef.current = null; }, 360);
      const cursor = current.state.selection.from;
      const start = Math.max(1, cursor - 80);
      const before = current.state.doc.textBetween(start, cursor, "\n", "\0");
      const match = before.match(/@([^\s@]*)$/u);
      setMention(match ? { from: cursor - match[0].length, query: match[1], to: cursor } : null);
      setActiveIndex(0);
    },
    onBlur: () => { if (pendingRef.current) onChange(pendingRef.current); pendingRef.current = null; if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); setMention(null); }
  });

  useEffect(() => { editor?.setEditable(!readOnly); }, [editor, readOnly]);
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = toTiptap(document, candidates);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: false });
  }, [candidates, editor, externalKey]);
  useEffect(() => () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); }, []);

  const filtered = useMemo(() => {
    const query = mention?.query.trim().toLowerCase() || "";
    return candidates.filter((candidate) => !query || `${candidate.label} ${candidate.referenceKind}`.toLowerCase().includes(query));
  }, [candidates, mention?.query]);
  const normalizedActiveIndex = filtered.length ? activeIndex % filtered.length : 0;

  const insertReference = (candidate: PromptReferenceCandidate) => {
    if (!editor || !mention || readOnly) return;
    userEditRef.current = true;
    editor.chain().focus().deleteRange({ from: mention.from, to: mention.to }).insertContent({
      type: "referenceToken",
      attrs: {
        id: `reference-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
        label: candidate.label,
        referenceKind: candidate.referenceKind,
        assetId: candidate.assetId || null,
        assetVersionId: candidate.assetVersionId || null,
        mediaId: candidate.mediaId || null,
        sourceNodeId: candidate.sourceNodeId || null,
        role: candidate.referenceKind === "image" ? "visual_reference" : `${candidate.referenceKind}_reference`,
        controls: [], doesNotControl: [], versionPolicy: "pinned", thumbnailUrl: candidate.thumbnailUrl || null
      }
    }).insertContent(" ").run();
    setMention(null);
  };
  insertActiveRef.current = () => { const candidate = filtered[normalizedActiveIndex]; if (candidate) insertReference(candidate); };

  return <div className="prompt-document-editor">
    <EditorContent editor={editor} />
    {mention && filtered.length ? <div className="prompt-document-mention-menu nowheel" role="listbox">
      {filtered.map((candidate, index) => <button aria-selected={index === normalizedActiveIndex} className={index === normalizedActiveIndex ? "active" : ""} key={candidate.key} onClick={() => insertReference(candidate)} onMouseDown={(event) => event.preventDefault()} role="option" type="button">
        <span className={`prompt-reference-candidate-thumb kind-${candidate.referenceKind}`}>{candidate.thumbnailUrl ? <img alt="" src={candidate.thumbnailUrl} /> : tokenIcon(candidate.referenceKind)}</span>
        <span><strong>{candidate.label}</strong><small>{candidate.referenceKind} · 提交真实媒体绑定</small></span>
      </button>)}
    </div> : null}
  </div>;
}
