import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FIELDS = Object.freeze({
  ununuApiKey: { file: "ununu-api-key", env: "UNUNU_GATE_API_KEY", provider: "ununu" },
  arkApiKey: { file: "ark-api-key", env: "ARK_API_KEY", provider: "ark" },
  openrouterApiKey: { file: "openrouter-api-key", env: "OPENROUTER_API_KEY", provider: "openrouter" },
  autodlApiToken: { file: "autodl-api-token", env: "AUTODL_API_TOKEN", provider: "autodl" },
  arkTtsApiKey: { file: "ark-tts-api-key", env: "ARK_TTS_API_KEY", provider: "arkTts" },
  arkTtsVoiceId: { file: "ark-tts-voice-id", env: "ARK_TTS_VOICE_ID", provider: "arkTtsVoice" },
  openspeechApiKey: { file: "openspeech-api-key", env: "OPENSPEECH_API_KEY", provider: "openspeech" },
  openspeechSpeakerId: { file: "openspeech-speaker-id", env: "OPENSPEECH_SPEAKER_ID", provider: "openspeechVoice" }
});

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export class LocalSecretStore {
  constructor(dataRoot, baseEnvironment = process.env) {
    this.directory = path.join(dataRoot, "secrets");
    this.baseEnvironment = baseEnvironment;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    this.h3ConfigPath = path.join(this.directory, "h3-config.json");
  }

  filePath(field) {
    return path.join(this.directory, FIELDS[field].file);
  }

  read(field) {
    const filePath = this.filePath(field);
    if (!existsSync(filePath)) return "";
    return clean(readFileSync(filePath, "utf8"));
  }

  write(field, value) {
    const filePath = this.filePath(field);
    const next = clean(value);
    if (!next) {
      if (existsSync(filePath)) unlinkSync(filePath);
      return;
    }
    const temporaryPath = path.join(this.directory, `.${FIELDS[field].file}.${randomUUID()}.partial`);
    writeFileSync(temporaryPath, `${next}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, filePath);
    chmodSync(filePath, 0o600);
  }

  update(input = {}) {
    for (const field of Object.keys(FIELDS)) {
      if (Object.hasOwn(input, field)) this.write(field, input[field]);
    }
    return this.status();
  }

  effectiveValue(field) {
    const definition = FIELDS[field];
    const direct = clean(this.baseEnvironment?.[definition.env]) || this.read(field);
    if (direct || field !== "openspeechApiKey") return direct;
    return clean(this.baseEnvironment?.ARK_API_KEY) || this.read("arkApiKey");
  }

  environment() {
    const environment = { ...this.baseEnvironment };
    for (const [field, definition] of Object.entries(FIELDS)) {
      const value = this.effectiveValue(field);
      if (value) environment[definition.env] = value;
    }
    return environment;
  }

  source(field) {
    const definition = FIELDS[field];
    if (clean(this.baseEnvironment?.[definition.env])) return "environment";
    if (this.read(field)) return "local-file";
    if (field === "openspeechApiKey") {
      if (clean(this.baseEnvironment?.ARK_API_KEY)) return "shared-ark-environment";
      if (this.read("arkApiKey")) return "shared-ark-local-file";
    }
    return "none";
  }

  h3Config() {
    const inline = clean(this.baseEnvironment?.UNUTV_H3_CONFIG_JSON);
    try {
      if (inline) return JSON.parse(inline);
      if (!existsSync(this.h3ConfigPath)) return null;
      return JSON.parse(readFileSync(this.h3ConfigPath, "utf8"));
    } catch {
      return null;
    }
  }

  h3ConfigSource() {
    if (clean(this.baseEnvironment?.UNUTV_H3_CONFIG_JSON)) return "environment";
    return existsSync(this.h3ConfigPath) ? "local-file" : "none";
  }

  importH3Config(sourcePath) {
    const resolved = path.resolve(clean(sourcePath));
    const parsed = JSON.parse(readFileSync(resolved, "utf8"));
    if (!clean(parsed?.comfy_url)) throw new Error("H3 config requires comfy_url");
    const temporaryPath = path.join(this.directory, `.h3-config.${randomUUID()}.partial`);
    writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, this.h3ConfigPath);
    chmodSync(this.h3ConfigPath, 0o600);
    return this.status();
  }

  status() {
    return {
      storageDirectory: this.directory,
      providers: {
        ununu: { configured: Boolean(this.effectiveValue("ununuApiKey")), source: this.source("ununuApiKey") },
        ark: { configured: Boolean(this.effectiveValue("arkApiKey")), source: this.source("arkApiKey") },
        minimax: { configured: Boolean(this.h3Config()), source: this.h3ConfigSource(), kind: "local-comfyui" },
        autodl: { configured: Boolean(this.effectiveValue("autodlApiToken")), source: this.source("autodlApiToken"), kind: "hosted-comfyui-api" },
        openrouter: { configured: Boolean(this.effectiveValue("openrouterApiKey")), source: this.source("openrouterApiKey") },
        arkTts: {
          configured: Boolean(this.effectiveValue("arkTtsApiKey")),
          source: this.source("arkTtsApiKey"),
          voiceConfigured: Boolean(this.effectiveValue("arkTtsVoiceId")),
          voiceSource: this.source("arkTtsVoiceId")
        },
        openspeech: {
          configured: Boolean(this.effectiveValue("openspeechApiKey")),
          source: this.source("openspeechApiKey"),
          speakerConfigured: Boolean(this.effectiveValue("openspeechSpeakerId")),
          speakerSource: this.source("openspeechSpeakerId")
        }
      }
    };
  }

  permissions() {
    return {
      directory: statSync(this.directory).mode & 0o777,
      files: {
        ...Object.fromEntries(Object.keys(FIELDS).filter((field) => existsSync(this.filePath(field))).map((field) => [field, statSync(this.filePath(field)).mode & 0o777])),
        ...(existsSync(this.h3ConfigPath) ? { h3Config: statSync(this.h3ConfigPath).mode & 0o777 } : {})
      }
    };
  }
}
