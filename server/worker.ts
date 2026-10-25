import { GoogleGenAI } from "@google/genai";

// ==========================================
// CONFIGURATION & TYPES
// ==========================================
const MOCK = false; // Set to true to stream mock data
const MOCK_DELAY_MS = 25;

export interface Env {
  GEMINI_API_KEY: string;
}

// Fallback payload for mock mode in environments without local file access
const DEFAULT_MOCK_PAYLOAD = JSON.stringify({
  type: "Container",
  layout: { direction: "column", gap: "md" },
  children: [
    {
      type: "WidgetHeader",
      props: { title: "Mock UI", subtitle: "Streaming simulated data" },
    },
    {
      type: "Text",
      props: { text: "Hello! This is a mock interface response." },
    },
  ],
});

// ANSI terminal colors (visible with `npx wrangler tail`)
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// CORS HELPERS
// ==========================================
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, req: Request): Response {
  const cors = getCorsHeaders(req);
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Generator that yields simulated SSE events without local disk access
 */
async function* createMockStream(mockText = DEFAULT_MOCK_PAYLOAD, delayMs = MOCK_DELAY_MS) {
  yield {
    event_type: "interaction.created",
    interaction: { id: `mock_${crypto.randomUUID().slice(0, 10)}` },
  };

  const chunks = mockText.match(/[^\r\n]*\r?\n|[^\r\n]+/g) || [mockText];

  for (const chunk of chunks) {
    await delay(delayMs);
    yield {
      event_type: "step.delta",
      delta: { text: chunk },
    };
  }
}

// ==========================================
// MAIN WORKER EXPORT
// ==========================================
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = performance.now();
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = new URL(req.url);

    const logPrefix = `${colors.dim}[${new Date().toISOString()}]${colors.reset} [${colors.cyan}${requestId}${colors.reset}]`;
    console.log(`${logPrefix} 📥 ${req.method} ${url.pathname}`);

    // 1. CORS Preflight
    if (req.method === "OPTIONS") {
      console.log(`${logPrefix} ${colors.green}204 OK${colors.reset} (CORS Preflight)`);
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(req),
      });
    }

    // 2. Delegate all other routes and guarantee CORS on responses
    try {
      const response = await handleRequest(req, env, requestId, logPrefix, startTime);
      return withCors(response, req);
    } catch (err: any) {
      const duration = (performance.now() - startTime).toFixed(0);
      console.error(`${logPrefix} ${colors.red}500 Internal Error${colors.reset} (${duration}ms):`, err.message);

      return withCors(
        new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
          },
        }),
        req
      );
    }
  },
};

// ==========================================
// REQUEST HANDLER
// ==========================================
async function handleRequest(
  req: Request,
  env: Env,
  requestId: string,
  logPrefix: string,
  startTime: number
): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;

    if (!body) {
      console.warn(`${logPrefix} ${colors.yellow}400 Bad Request${colors.reset} - Missing JSON body`);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      message,
      conversationId,
      model = "gemma-4-31b-it",
    } = body;

    console.log(
      `${logPrefix} Model: ${colors.cyan}${model}${colors.reset} | ConvID: ${colors.yellow}${conversationId || "new"}${colors.reset}`
    );
    console.log(
      `${logPrefix} Prompt: "${colors.dim}${message?.slice(0, 80)}${message?.length > 80 ? "..." : ""}${colors.reset}"`
    );

    if (!message) {
      console.warn(`${logPrefix} ${colors.yellow}400 Bad Request${colors.reset} - Missing 'message'`);
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fetchStart = performance.now();
    let stream: AsyncIterable<any>;

    if (MOCK) {
      console.log(`${logPrefix} 🧪 ${colors.yellow}[MOCK MODE]${colors.reset} Streaming mock response...`);
      stream = createMockStream();
    } else {
      console.log(`${logPrefix} ⏳ Requesting stream from Gemini API...`);

      // Initialize the SDK per-request using the Cloudflare Worker binding
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

      stream = await ai.interactions.create({
        model,
        input: message,
        previous_interaction_id: conversationId,
        stream: true,
        generation_config: {
          max_output_tokens: 65535,
          thinking_level: "high",
        },
        system_instruction:
          `You are an interface-generating conversational agent. Generate a user interface for the user's request using the defined UI schema. STRICTLY return valid JSON adhering to the schema. Keep in mind that if the user is just saying Hi, you can generate a simple text component. Generated interfaces are automatically styled. You can use state (see the schema).
const uiSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [
        "Container",
        "WidgetHeader",
        "Text",
        "Icon",
        "Badge",
        "Divider",
        "Button",
        "Rating",
        "Switch",
        "Progress",
        "HoldToConfirm",
        "SegmentedControl",
        "ElasticSlider",
        "Stepper",
        "ExpandableText",
        "InlineEdit",
      ],
      description: "The component type to render.",
    },

    // 1. Initial State Variables (placed on root Container)
    state: {
      type: "object",
      description: "Initial reactive variables, e.g. { 'count': 0, 'power': true }",
    },

    // 2. Two-Way Binding for Inputs (Switch, Slider, SegmentedControl)
    bind: {
      type: "string",
      description: "State key to bind this input to (e.g. 'brightness', 'isOnline')",
    },

    // 3. Click / Press Actions (Button, HoldToConfirm)
    action: {
      type: "object",
      description: "Action triggered on click/interaction",
      properties: {
        type: {
          type: "string",
          enum: ["set", "toggle", "increment", "decrement", "callLLM"],
        },
        target: { type: "string", description: "State key to modify" },
        value: {
          type: "number",
          description: "Value to set, or amount to increment/decrement by",
        },
      },
    },

    layout: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["row", "column"] },
        gap: { type: "string", enum: ["sm", "md", "lg"] },
        align: { type: "string", enum: ["start", "center", "end"] },
        justify: { type: "string", enum: ["start", "center", "between"] },
      },
    },

    props: {
      type: "object",
      properties: {
        label: { type: "string", description: "Can use {{stateVar}} (e.g. 'Count: {{count}}')" },
        title: { type: "string" },
        subtitle: { type: "string" },
        variant: { type: "string", enum: ["primary", "secondary", "destructive", "outline"] },
        iconName: { type: "string" },
        value: { type: "number" },
        min: { type: "number" },
        max: { type: "number" },
        checked: { type: "boolean" },
        options: { type: "array", items: { type: "string" } },
        steps: { type: "array", items: { type: "string" } },
        currentStep: { type: "number" },
        text: { type: "string" },
      },
    },

    children: {
      type: "array",
      items: { $ref: "#" },
    },
  },
  required: ["type"],
}`,
      });
    }

    const encoder = new TextEncoder();
    let nextInteractionId = conversationId;
    let tokenChunkCount = 0;
    let thoughtChunkCount = 0;
    let firstChunkTime: number | null = null;

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            // 1. Capture interaction ID across lifecycles
            const streamId =
              event.interaction?.id ||
              event.interaction_id ||
              (event as any).id;

            if (streamId) {
              nextInteractionId = streamId;
            }

            // 2. Handle deltas
            if (event.event_type === "step.delta" && event.delta) {
              if (!firstChunkTime) {
                firstChunkTime = performance.now();
                const ttft = (firstChunkTime - fetchStart).toFixed(0);
                console.log(`${logPrefix} ⚡ First response chunk received in ${ttft}ms (TTFT)`);
              }

              // Handle model thinking phase
              if (event.delta.thought) {
                thoughtChunkCount++;
                const thoughtPayload = JSON.stringify({
                  type: "thought",
                  text: event.delta.text,
                });
                controller.enqueue(encoder.encode(`data: ${thoughtPayload}\n\n`));
              }
              // Handle actual JSON text generation
              else if (event.delta.text) {
                tokenChunkCount++;
                const tokenPayload = JSON.stringify({
                  type: "token",
                  text: event.delta.text,
                });
                controller.enqueue(encoder.encode(`data: ${tokenPayload}\n\n`));
              }
            }
          }

          // 3. Emit final payload with next conversation ID
          const donePayload = JSON.stringify({
            type: "done",
            conversationId: nextInteractionId,
          });
          controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
          controller.close();

          const totalDuration = (performance.now() - startTime).toFixed(0);
          console.log(
            `${logPrefix} ${colors.green}✔ Completed${colors.reset} in ${totalDuration}ms | ` +
            `Thoughts: ${colors.magenta}${thoughtChunkCount}${colors.reset} | ` +
            `JSON Chunks: ${colors.green}${tokenChunkCount}${colors.reset} | ` +
            `Next ConvID: ${colors.yellow}${nextInteractionId || "none"}${colors.reset}`
          );
        } catch (err: any) {
          const totalDuration = (performance.now() - startTime).toFixed(0);
          console.error(
            `${logPrefix} ${colors.red}❌ Stream Error${colors.reset} after ${totalDuration}ms:`,
            err.message
          );
          const errPayload = JSON.stringify({ type: "error", error: err.message });
          controller.enqueue(encoder.encode(`data: ${errPayload}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Request-Id": requestId,
      },
    });
  }

  const duration = (performance.now() - startTime).toFixed(0);
  console.warn(`${logPrefix} ${colors.yellow}404 Not Found${colors.reset} (${duration}ms)`);
  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}