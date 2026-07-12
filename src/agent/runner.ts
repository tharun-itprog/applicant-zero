import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { getModels } from "@earendil-works/pi-ai/compat";

export function agentEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AZERO_AGENT !== "off";
}

/**
 * One headless pi run: fresh in-memory session, built-in coding tools
 * disabled, only the provided custom tools registered. The prompt resolves
 * when the agent's loop ends; results are captured by the tools' closures.
 */
export async function runStage(prompt: string, tools: ToolDefinition[]): Promise<void> {
  const modelId = process.env.AZERO_MODEL ?? "claude-sonnet-5";
  const model = getModels("anthropic").find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown Anthropic model id "${modelId}" (set AZERO_MODEL)`);

  const authStorage = AuthStorage.create();
  const { session } = await createAgentSession({
    model,
    authStorage,
    modelRegistry: ModelRegistry.create(authStorage),
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
    customTools: tools,
    thinkingLevel: "low",
  });
  try {
    await session.prompt(prompt);
  } finally {
    session.dispose();
  }
}
