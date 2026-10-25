import { GoogleGenAI } from "@google/genai";

// ==========================================
// CONFIGURATION
// ==========================================
const MOCK = true; // Toggle to true to stream from `.response`
const MOCK_DELAY_MS = 35; // Simulated delay between chunks in ms
const PORT = process.env.PORT || 3000;

// Automatically picks up GEMINI_API_KEY from process.env
const ai = new GoogleGenAI({});

// Terminal colors for clean console output
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const uiSchema = {
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
  required: ["type", "children"],
};

/**
 * Generator that yields mock Gemini stream events from `.response`
 */
async function* createMockStream(filePath = ".response", delayMs = MOCK_DELAY_MS) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Mock file '${filePath}' not found. Please create it with sample JSON.`);
  }

  const text = await file.text();

  // 1. Emit mock interaction ID
  yield {
    event_type: "interaction.created",
    interaction: { id: `mock_${crypto.randomUUID().slice(0, 10)}` },
  };

  // 2. Break up line-by-line while preserving \n characters
  const chunks = text.match(/[^\r\n]*\r?\n|[^\r\n]+/g) || [text];

  for (const chunk of chunks) {
    await Bun.sleep(delayMs); // Simulate realistic model generation speed
    yield {
      event_type: "step.delta",
      delta: { text: chunk },
    };
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const startTime = performance.now();
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = new URL(req.url);

    const logPrefix = `${colors.dim}[${new Date().toISOString()}]${colors.reset} [${colors.cyan}${requestId}${colors.reset}]`;

    console.log(`${logPrefix} 📥 ${req.method} ${url.pathname}`);

    // Handle CORS preflight
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

    // Chat / Inference Endpoint
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
          model = "gemma-4-31b-it",
        } = body;

        console.log(
          `${logPrefix} Model: ${colors.cyan}${model}${colors.reset} | ConvID: ${colors.yellow}${conversationId || "new"}${colors.reset}`
        );
        console.log(
          `${logPrefix} Prompt preview: "${colors.dim}${message?.slice(0, 60)}${message?.length > 60 ? "..." : ""}${colors.reset}"`
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

        // Switch between Mock stream and Real Gemini API
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
            system_instruction: "Generate a user interface for the given user's request based on the given schema. STRICTLY adhere to the schema.",
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: uiSchema,
            },
          });
        }

        const encoder = new TextEncoder();
        let nextInteractionId = conversationId;
        let chunkCount = 0;
        let firstChunkTime: number | null = null;

        const responseStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of stream) {
                // 1. Capture interaction ID
                const streamId =
                  event.interaction?.id ||
                  event.interaction_id ||
                  (event as any).id;

                if (streamId) {
                  nextInteractionId = streamId;
                }

                // 2. Incremental text chunks arrive in step.delta events
                if (event.event_type === "step.delta" && event.delta?.text) {
                  chunkCount++;
                  if (!firstChunkTime) {
                    firstChunkTime = performance.now();
                    const ttft = (firstChunkTime - fetchStart).toFixed(0);
                    console.log(`${logPrefix} ⚡ First token/chunk received in ${ttft}ms`);
                  }

                  const payload = JSON.stringify({
                    type: "token",
                    text: event.delta.text,
                  });
                  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
              }

              // 3. Emit final payload with ID
              const donePayload = JSON.stringify({
                type: "done",
                conversationId: nextInteractionId,
              });
              controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
              controller.close();

              const totalDuration = (performance.now() - startTime).toFixed(0);
              console.log(
                `${logPrefix} ${colors.green}✔ Stream Completed${colors.reset} in ${totalDuration}ms | Chunks: ${chunkCount} | Next ConvID: ${colors.yellow}${nextInteractionId || "none"}${colors.reset}`
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