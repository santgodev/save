// Thin wrapper around the OpenAI Chat Completions API.
// Keeps the API key on the server (CRITICAL — never ship to client),
// supports tool / function calling, and returns the parsed JSON body.

export type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionRequest = {
  model?: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
};

export type ChatCompletionResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: OpenAIMessage;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const DEFAULT_MODEL = "gpt-4o-mini";

export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the function environment");
  }

  const body = {
    model: req.model ?? DEFAULT_MODEL,
    messages: req.messages,
    ...(req.tools ? { tools: req.tools, tool_choice: req.tool_choice ?? "auto" } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
    ...(req.response_format ? { response_format: req.response_format } : {}),
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }

  return await res.json() as ChatCompletionResponse;
}
