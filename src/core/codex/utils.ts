import type {
  AgentMessageItem,
  CommandExecutionItem,
  ThreadEvent,
  ThreadItem,
} from "@openai/codex-sdk";

const COLOR = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  magenta: "\u001b[35m",
};

export function combinePrompts(auditorPrompt: string, formatter: string): string {
  const parts = [auditorPrompt.trim(), formatter.trim()].filter(Boolean);
  return parts.join("\n\n");
}

export function formatEvent(context: string, event: ThreadEvent): string {
  switch (event.type) {
    case "thread.started":
      return `${COLOR.dim}${COLOR.cyan}[${context}] thread started${COLOR.reset}`;
    case "turn.started":
      return `${COLOR.cyan}[${context}] turn started${COLOR.reset}`;
    case "turn.completed":
      return `${COLOR.green}✔ [${context}] turn completed (in:${event.usage.input_tokens}, out:${event.usage.output_tokens})${COLOR.reset}`;
    case "turn.failed":
      return `${COLOR.red}✖ [${context}] turn failed: ${event.error.message}${COLOR.reset}`;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return formatItemEvent(context, event.item, event.type);
    case "error":
      return `${COLOR.red}✖ [${context}] stream error: ${event.message}${COLOR.reset}`;
    default:
      return assertUnreachable(event);
  }
}

function formatItemEvent(
  context: string,
  item: ThreadItem,
  phase: "item.started" | "item.updated" | "item.completed"
): string {
  const prefix = `[${context}] ${item.type}`;
  const { icon, color } = iconForPhase(phase);

  switch (item.type) {
    case "agent_message":
      return colorize(item.text ? `${icon} ${prefix}: ${item.text}` : `${icon} ${prefix}`, color);
    case "reasoning":
      return colorize(item.text ? `${icon} ${prefix}: ${item.text}` : `${icon} ${prefix}`, color);
    case "command_execution":
      return colorize(formatCommand(`${icon} ${prefix}`, item), color);
    case "file_change":
      return colorize(
        `${icon} ${prefix}: ${item.changes.map((c) => `${c.kind}:${c.path}`).join(", ")}`,
        color
      );
    case "mcp_tool_call":
      return colorize(`${icon} ${prefix}: ${item.server}.${item.tool}`, color);
    case "web_search":
      return colorize(`${icon} ${prefix}: ${item.query}`, color);
    case "todo_list":
      return colorize(`${icon} ${prefix}: ${item.items.length} todos`, color);
    case "error":
      return colorize(`${icon} ${prefix}: ${item.message}`, COLOR.red);
    default:
      return colorize(`${icon} ${prefix}`, color);
  }
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

function formatCommand(prefix: string, item: CommandExecutionItem): string {
  const status = item.status ? ` [${item.status}]` : "";
  const command = item.command ? ` ${item.command}` : "";
  return `${prefix}${status}:${command}`.trim();
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

export function colorKeyForEvent(message: string): keyof typeof COLOR | undefined {
  if (message.includes("✖")) return "red";
  if (message.includes("✔")) return "green";
  if (message.includes("⏳") || message.includes("↻")) return "yellow";
  return undefined;
}

function iconForPhase(phase: "item.started" | "item.updated" | "item.completed") {
  switch (phase) {
    case "item.started":
      return { icon: "⏳", color: COLOR.yellow };
    case "item.updated":
      return { icon: "↻", color: COLOR.cyan };
    case "item.completed":
      return { icon: "✔", color: COLOR.green };
    default:
      return { icon: "•", color: COLOR.magenta };
  }
}

function colorize(text: string, color: string): string {
  return `${color}${text}${COLOR.reset}`;
}
