import type {
  AgentMessageItem,
  CommandExecutionItem,
  ErrorItem,
  FileChangeItem,
  McpToolCallItem,
  ReasoningItem,
  ThreadEvent,
  ThreadItem,
  TodoListItem,
  WebSearchItem,
} from "@openai/codex-sdk";

const ESC = "\u001b[";
const RESET = `${ESC}0m`;
const COLOR = {
  dim: `${ESC}90m`,
  cyan: `${ESC}96m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  red: `${ESC}31m`,
  magenta: `${ESC}35m`,
  blue: `${ESC}94m`,
};

export function combinePrompts(auditorPrompt: string, formatter: string): string {
  const parts = [auditorPrompt.trim(), formatter.trim()].filter(Boolean);
  return parts.join("\n\n");
}

export function formatEvent(context: string, event: ThreadEvent): string {
  const ctx = colorize(`[${context}]`, COLOR.dim);

  switch (event.type) {
    case "thread.started":
      return `${ctx} 🧵 ${colorize("thread started", COLOR.cyan)} (id=${event.thread_id})`;
    case "turn.started":
      return `${ctx} ⚡ ${colorize("turn started", COLOR.cyan)}`;
    case "turn.completed": {
      const usage = event.usage
        ? `tokens in:${event.usage.input_tokens} cached:${event.usage.cached_input_tokens} out:${event.usage.output_tokens}`
        : "turn completed";
      return `${ctx} ✅ ${colorize(usage, COLOR.green)}`;
    }
    case "turn.failed":
      return `${ctx} 🛑 ${colorize(`turn failed: ${event.error.message}`, COLOR.red)}`;
    case "item.started":
    case "item.updated":
    case "item.completed": {
      const isFinalAgentMessage = event.type === "item.completed" && isAgentMessage(event.item);
      const { icon, color, text } = describeItem(event.item, isFinalAgentMessage);
      const phase = event.type === "item.started" ? "start" : event.type === "item.completed" ? "done" : "update";
      const phaseIcon =
        event.type === "item.started" ? "🚀" : event.type === "item.completed" ? (isFinalAgentMessage ? "🏆" : "🏁") : "🔄";
      return `${ctx} ${phaseIcon} ${colorize(`${icon} ${phase}: ${text}`, color)}`;
    }
    case "error":
      return `${ctx} ❗ ${colorize(`stream error: ${event.message}`, COLOR.red)}`;
    default:
      return `${ctx} ${JSON.stringify(event)}`;
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

export function assertUnreachable(x: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(x)}`);
}

export const dynamicImport: <T>(specifier: string) => Promise<T> = (specifier) =>
  new Function("specifier", "return import(specifier);")(specifier);

function summarizeText(text: string, maxLen: number | null = 200): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (maxLen === null || maxLen === Infinity) {
    return cleaned;
  }
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

function statusColor(status?: string): string {
  if (!status) return COLOR.dim;
  if (status === "failed") return COLOR.red;
  if (status === "completed") return COLOR.green;
  if (status === "in_progress") return COLOR.yellow;
  return COLOR.dim;
}

function describeItem(
  item: ThreadItem,
  isFinalAgentMessage = false
): { icon: string; color: string; text: string } {
  switch (item.type) {
    case "agent_message": {
      const content = summarizeText(
        (item as AgentMessageItem).text,
        isFinalAgentMessage ? null : 200
      );
      if (isFinalAgentMessage) {
        return {
          icon: "🎯",
          color: COLOR.green,
          text: `FINAL RESPONSE: ${content || "<empty>"}`,
        };
      }
      return { icon: "💬", color: COLOR.cyan, text: content || "<empty>" };
    }
    case "reasoning": {
      const content = summarizeText((item as ReasoningItem).text);
      return { icon: "🧠", color: COLOR.magenta, text: content || "<empty>" };
    }
    case "command_execution": {
      const cmdItem = item as CommandExecutionItem;
      const status = cmdItem.status;
      const exit = cmdItem.exit_code !== undefined ? ` (exit ${cmdItem.exit_code})` : "";
      const command = summarizeText(cmdItem.command, 120);
      return {
        icon: "💻",
        color: statusColor(status),
        text: `$ ${command} [${status}]${exit}`,
      };
    }
    case "file_change": {
      const fcItem = item as FileChangeItem;
      const summary = fcItem.changes
        ? fcItem.changes
            .map((change) => {
              const prefix = change.kind === "add" ? "+" : change.kind === "delete" ? "-" : "~";
              return `${prefix}${change.path}`;
            })
            .join(", ")
        : "file change";
      return {
        icon: "📝",
        color: statusColor(fcItem.status),
        text: `${summary}${fcItem.status ? ` [${fcItem.status}]` : ""}`,
      };
    }
    case "mcp_tool_call": {
      const mcpItem = item as McpToolCallItem;
      const label = `${mcpItem.server}.${mcpItem.tool}`;
      return {
        icon: "🛠️",
        color: statusColor(mcpItem.status),
        text: `${label} [${mcpItem.status}]`,
      };
    }
    case "web_search": {
      const wsItem = item as WebSearchItem;
      return {
        icon: "🌐",
        color: COLOR.blue,
        text: summarizeText(wsItem.query, 160),
      };
    }
    case "todo_list": {
      const todo = item as TodoListItem;
      const total = todo.items.length;
      const done = todo.items.filter((i) => i.completed).length;
      return { icon: "☑️", color: COLOR.green, text: `todo ${done}/${total}` };
    }
    case "error": {
      const errItem = item as ErrorItem;
      return { icon: "❗", color: COLOR.red, text: summarizeText(errItem.message, 160) };
    }
    default:
      return { icon: "ℹ️", color: COLOR.dim, text: summarizeText(JSON.stringify(item), 160) };
  }
}

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

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
