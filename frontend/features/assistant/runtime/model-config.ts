import {
  defaultModel,
  providerConnections,
  type AssistantModel,
  type ModelConnection,
} from "../config/models";

export type ModelIdentity = { id: string; name: string };
export type RunModel = ModelIdentity & {
  provider?: AssistantModel["provider"];
  modelId?: string;
  baseUrl?: string;
  apiKey?: string;
};

export function getModelConnection(
  model: AssistantModel,
  connections: ReadonlyMap<string, ModelConnection>,
): ModelConnection {
  return (
    connections.get(model.id) ?? {
      modelId: model.id.slice(model.provider.length + 1),
      baseUrl: providerConnections[model.provider].baseUrl,
    }
  );
}

export function resolveRunModel(
  id: string,
  models: readonly AssistantModel[],
  connections: ReadonlyMap<string, ModelConnection>,
  getApiKey: (model: AssistantModel) => string | undefined,
): RunModel {
  if (id === defaultModel.id) return { id, name: defaultModel.name };
  const model = models.find((item) => item.id === id);
  if (!model) throw new Error("The selected model no longer exists. Select another model.");
  const connection = getModelConnection(model, connections);
  const apiKey = getApiKey(model)?.trim() ?? "";
  if (providerConnections[model.provider].requiresApiKey && !apiKey)
    throw new Error(`Set an API key for ${model.name} before sending a message.`);
  if (!connection.modelId || !connection.baseUrl)
    throw new Error(`Configure a connection for ${model.name} before sending a message.`);
  return { id, name: model.name, provider: model.provider, ...connection, apiKey };
}
