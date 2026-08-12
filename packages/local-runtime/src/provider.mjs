import { UnuTvError } from "@ununu/unutv-contracts";

export class DisabledProvider {
  async listModels() {
    return { models: [], reason: "provider_not_configured" };
  }

  async run() {
    throw new UnuTvError(
      "provider_not_configured",
      "No paid model provider is configured. Configure an approved provider adapter before running this node.",
      409
    );
  }
}

