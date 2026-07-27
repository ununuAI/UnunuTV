task_id: 20260718-local-provider-secrets
goal: Persist provider credentials under the local runtime root without exposing plaintext through projects, API responses, logs, or the browser.
done_when: Local settings API and UI can save/status/delete credentials; files use 0600 under a 0700 directory; provider adapters use updates without restart; plaintext never appears in responses.
scope: Only the standalone ununu-unutv repository and its resolved data-root secrets directory; one explicitly authorized local migration from the legacy credential file; no paid calls or keychain integration.
verify: Provider secret-store tests, API redaction test, hot-reload provider fixture, architecture scan, Next build, and npm audit.
status: accepted
evidence: npm run verify -> 9 tests passed, architecture boundaries verified, and the Next production build completed; npm audit -> 0 vulnerabilities; actual Ark, OpenRouter, and OpenSpeech statuses are configured from local files; ~/.unutv/secrets is mode 0700 and credential files are mode 0600; browser smoke -> all three cards render as configured with empty inputs and no plaintext response; no paid provider call was made.
