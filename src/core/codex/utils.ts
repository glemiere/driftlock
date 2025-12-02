import type {
  AgentMessageItem,
  CommandExecutionItem,
  ThreadEvent,
  ThreadItem,
} from "@openai/codex-sdk";

export function combinePrompts(auditorPrompt: string, formatter: string): string {
  const parts = [auditorPrompt.trim(), formatter.trim()].filter(Boolean);
  return parts.join("\n\n");
}

export function formatEvent(context: string, event: ThreadEvent): string {
  return `[${context}] ${JSON.stringify(event)}`;
}

export function extractAgentText(event: ThreadEvent): string | null {
  if (event.type !== "item.completed" && event.type !== "item.updated") {
    return null;
  }

  const item = event.item;
  if (isAgentMessage(item) && typeof item.text === "string") {
    return item.text;
  }

  return null;
}

function isAgentMessage(item: ThreadItem): item is AgentMessageItem {
  return item.type === "agent_message";
}

export function assertUnreachable(x: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(x)}`);
}

export const dynamicImport: <T>(specifier: string) => Promise<T> = (specifier) =>
  new Function("specifier", "return import(specifier);")(specifier);

export function formatCodexError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("Codex Exec exited with code")) {
    return `${raw}. Check that the Codex binary can run (node_modules/.bin/codex), CODEX_API_KEY is set, and the working directory is valid.`;
  }
  return raw;
}

export function parseJsonSafe(text: string | null): unknown | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
