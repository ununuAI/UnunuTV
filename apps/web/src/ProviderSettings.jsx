"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

function Status({ configured, source }) {
  return <span className={`credential-status ${configured ? "configured" : "missing"}`}>
    {configured ? `已配置 · ${source === "environment" ? "环境变量" : "本地文件"}` : "未配置"}
  </span>;
}

function SecretField({ label, value, onChange, onSave, onClear, configured, source, placeholder }) {
  return <label>{label}
    <div className="secret-field">
      <input type="password" autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <button disabled={!value.trim()} onClick={onSave}>保存</button>
      <button className="clear-secret" disabled={!configured || source === "environment"} onClick={onClear}>清除</button>
    </div>
  </label>;
}

export default function ProviderSettings({ notify }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ ununuApiKey: "", arkApiKey: "", openrouterApiKey: "", openspeechApiKey: "", openspeechSpeakerId: "" });
  const load = useCallback(async () => setStatus(await api.providerSettings()), []);
  useEffect(() => { load().catch(notify); }, [load, notify]);

  function field(name) {
    return {
      value: form[name],
      onChange: (value) => setForm((current) => ({ ...current, [name]: value })),
      onSave: () => save({ [name]: form[name] }, name),
      onClear: () => save({ [name]: null }, name)
    };
  }

  async function save(payload, fieldName) {
    try {
      const next = await api.updateProviderSettings(payload);
      setStatus(next);
      setForm((current) => ({ ...current, [fieldName]: "" }));
      notify(payload[fieldName] === null ? "本地凭证已清除" : "凭证已安全保存，无需重启", false);
    } catch (error) { notify(error); }
  }

  if (!status) return <div className="empty-panel"><div className="empty-mark">KEY</div><p>正在读取本地 Provider 配置…</p></div>;
  const openspeech = status.providers.openspeech || { configured: false, source: "none", speakerConfigured: false, speakerSource: "none" };
  return <div className="panel-stack settings-panel">
    <div className="settings-storage"><span>LOCAL SECRET STORE</span><code>{status.storageDirectory}</code><small>目录 0700 · 文件 0600 · 明文不会返回浏览器</small></div>

    <article className="provider-card">
      <header><div><b>Ununu Image</b><small>GPT Image 2 · 图片生成与参考图编辑</small></div><Status {...status.providers.ununu} /></header>
      <SecretField label="Ununu Gate API Key" placeholder="输入图片生成 Key（保存后立即清空）" configured={status.providers.ununu.configured} source={status.providers.ununu.source} {...field("ununuApiKey")} />
    </article>

    <article className="provider-card">
      <header><div><b>Ark Seedance</b><small>视频生成 · 隧道参考媒体</small></div><Status {...status.providers.ark} /></header>
      <SecretField label="ARK API Key" placeholder="输入新 Key（保存后立即清空）" configured={status.providers.ark.configured} source={status.providers.ark.source} {...field("arkApiKey")} />
    </article>

    <article className="provider-card">
      <header><div><b>OpenRouter</b><small>Nano Banana 2 图片生成 · HappyHorse 视频生成</small></div><Status {...status.providers.openrouter} /></header>
      <SecretField label="OpenRouter API Key" placeholder="输入新 Key（保存后立即清空）" configured={status.providers.openrouter.configured} source={status.providers.openrouter.source} {...field("openrouterApiKey")} />
    </article>

    <article className="provider-card">
      <header><div><b>Doubao Seed Audio</b><small>OpenSpeech · 对白、旁白与音频生成</small></div><Status configured={openspeech.configured} source={openspeech.source} /></header>
      <SecretField label="OpenSpeech X-Api-Key" placeholder="输入独立音频 Key" configured={openspeech.configured} source={openspeech.source} {...field("openspeechApiKey")} />
      <label>默认 Speaker ID（可选）
        <div className="secret-field">
          <input value={form.openspeechSpeakerId} onChange={(event) => setForm((current) => ({ ...current, openspeechSpeakerId: event.target.value }))} placeholder={openspeech.speakerConfigured ? "已配置默认 Speaker ID" : "按角色任务单独填写也可以"} />
          <button disabled={!form.openspeechSpeakerId.trim()} onClick={() => save({ openspeechSpeakerId: form.openspeechSpeakerId }, "openspeechSpeakerId")}>保存</button>
          <button className="clear-secret" disabled={!openspeech.speakerConfigured || openspeech.speakerSource === "environment"} onClick={() => save({ openspeechSpeakerId: null }, "openspeechSpeakerId")}>清除</button>
        </div>
      </label>
    </article>

    <div className="settings-warning">付费调用仍需在具体生成任务中勾选“我确认这次付费调用”。保存 Key 不会自动发起任何模型请求。</div>
  </div>;
}
