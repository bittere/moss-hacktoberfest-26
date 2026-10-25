import { GoogleGenAI } from "@google/genai";

// ==========================================
// CONFIGURATION
// ==========================================
const MOCK = false; // Set to true to stream mock data from `.response`
const MOCK_DELAY_MS = 25; // Simulated delay between mock chunks
const PORT = process.env.PORT || 3000;

// Automatically reads GEMINI_API_KEY from environment
const ai = new GoogleGenAI({});

// ANSI terminal colors
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

// UI Schema: Only 'type' is required to prevent recursive leaf node deadlocks
const uiSchema = {
  type: "object",
  properties: {
    type: { type: "string" },
    layout: {
      type: "object",
      properties: {
        direction: { type: "string" },
        gap: { type: "string" },
      },
    },
    props: { type: "object" }, // 👈 Keeps FSM states small
    children: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          props: { type: "object" },
          children: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                props: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
  required: ["type"],
};

/**
 * Generator that yields simulated SSE events by reading a local `.response` file
 */
async function* createMockStream(filePath = ".response", delayMs = MOCK_DELAY_MS) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Mock file '${filePath}' not found. Please create it with sample JSON.`);
  }

  const text = await file.text();

  // 1. Emit simulated interaction ID
  yield {
    event_type: "interaction.created",
    interaction: { id: `mock_${crypto.randomUUID().slice(0, 10)}` },
  };

  // 2. Break up content line-by-line while preserving \n characters
  const chunks = text.match(/[^\r\n]*\r?\n|[^\r\n]+/g) || [text];

  for (const chunk of chunks) {
    await Bun.sleep(delayMs);
    yield {
      event_type: "step.delta",
      delta: { text: chunk },
    };
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const startTime = performance.now();
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = new URL(req.url);

    const logPrefix = `${colors.dim}[${new Date().toISOString()}]${colors.reset} [${colors.cyan}${requestId}${colors.reset}]`;

    console.log(`${logPrefix} 📥 ${req.method} ${url.pathname}`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      console.log(`${logPrefix} ${colors.green}204 OK${colors.reset} (CORS Preflight)`);
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Chat endpoint
    if (url.pathname === "/api/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => null);
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
          // Default to gemini-2.5-flash for rock-solid schema compliance
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
          console.log(`${logPrefix} 🧪 ${colors.yellow}[MOCK MODE]${colors.reset} Streaming from .response file...`);
          stream = createMockStream(".response");
        } else {
          console.log(`${logPrefix} ⏳ Requesting stream from Gemini API...`);

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
              `You are an interface-generating conversational agent. Generate a user interface for the user's request using the defined UI schema. STRICTLY return valid JSON adhering to the schema. Keep in mind that if the user is just saying Hi, you need not generate an entire interface for them. Generated interfaces are automatically styled.
Schema: {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [
        "Container",
        "Text",
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
    layout: {
      type: "object",
      description: "Flexbox layout options for Container.",
      properties: {
        direction: { type: "string", enum: ["row", "column"] },
        gap: { type: "string", enum: ["sm", "md", "lg"] },
        align: { type: "string", enum: ["start", "center", "end"] },
        justify: { type: "string", enum: ["start", "center", "between"] },
      },
    },
    props: {
      type: "object",
      description: "Properties specific to each component type.",
      properties: {
        label: { type: "string", description: "Label or title of the element" },
        variant: { type: "string", enum: ["primary", "secondary", "destructive"] },
        actionId: { type: "string", description: "Identifier passed on interaction" },

        // Rating & Sliders & Progress
        value: { type: "number", description: "Numeric value for Rating, Progress, or Slider" },
        min: { type: "number", description: "Minimum range limit" },
        max: { type: "number", description: "Maximum range limit" },

        // Switch
        checked: { type: "boolean", description: "Initial switch state" },

        // Segmented Control & Stepper
        options: {
          type: "array",
          items: { type: "string" },
          description: "Choices for SegmentedControl",
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Step titles for Stepper",
        },
        currentStep: { type: "number", description: "0-based active step for Stepper" },

        // Expandable Text & Inline Edit
        text: { type: "string", description: "Body text or editable value" },
      },
    },
    children: {
      type: "array",
      description: "Nested components inside a Container.",
      items: {
        $ref: "#",
      },
    },
  },
  required: ["type"], // Critical: leaf nodes must NOT be forced to have children
}`,
            // response_format: {
            //   type: "text",
            //   mime_type: "application/json",
            //   schema: uiSchema,
            // },
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
            "Access-Control-Allow-Origin": "*",
            "X-Request-Id": requestId,
          },
        });
      } catch (err: any) {
        const duration = (performance.now() - startTime).toFixed(0);
        console.error(`${logPrefix} ${colors.red}500 Internal Error${colors.reset} (${duration}ms):`, err.message);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const duration = (performance.now() - startTime).toFixed(0);
    console.warn(`${logPrefix} ${colors.yellow}404 Not Found${colors.reset} (${duration}ms)`);
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Bun AI server listening on http://localhost:${PORT} (MOCK=${MOCK})`);