import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FIELDS = Object.freeze({
  ununuApiKey: { file: "ununu-api-key", env: "UNUNU_GATE_API_KEY", provider: "ununu" },
  arkApiKey: { file: "ark-api-key", env: "ARK_API_KEY", provider: "ark" },
  openrouterApiKey: { file: "openrouter-api-key", env: "OPENROUTER_API_KEY", provider: "openrouter" },
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
    return clean(this.baseEnvironment?.[definition.env]) || this.read(field);
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
    return this.read(field) ? "local-file" : "none";
  }

  status() {
    return {
      storageDirectory: this.directory,
      providers: {
        ununu: { configured: Boolean(this.effectiveValue("ununuApiKey")), source: this.source("ununuApiKey") },
        ark: { configured: Boolean(this.effectiveValue("arkApiKey")), source: this.source("arkApiKey") },
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
      files: Object.fromEntries(Object.keys(FIELDS).filter((field) => existsSync(this.filePath(field))).map((field) => [field, statSync(this.filePath(field)).mode & 0o777]))
    };
  }
}
