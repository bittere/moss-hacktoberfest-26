import { GoogleGenAI } from "@google/genai";

// Automatically picks up GEMINI_API_KEY from process.env
const ai = new GoogleGenAI({});

const PORT = process.env.PORT || 3000;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
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
        const body = await req.json();
        const {
          message,
          conversationId, // maps to previous_interaction_id
          model = "gemma-4-26b-a4b-it", // or "gemini-2.5-flash"
        } = body;

        if (!message) {
          return new Response(JSON.stringify({ error: "Message is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Call the Gemini Interactions API with streaming enabled
        const stream = await ai.interactions.create({
          model,
          input: message,
          previous_interaction_id: conversationId,
          stream: true,
        });

        // Create a ReadableStream formatted as Server-Sent Events (SSE)
        const encoder = new TextEncoder();
        let nextInteractionId = conversationId;

        const responseStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of stream) {
                // Track interaction/session ID from the stream events
                if (event.id) {
                  nextInteractionId = event.id;
                }

                // Incremental text chunks arrive in step.delta events
                if (event.event_type === "step.delta" && event.delta?.text) {
                  const payload = JSON.stringify({
                    type: "token",
                    text: event.delta.text,
                  });
                  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
              }

              // Send a final event containing the interaction ID for subsequent turns
              const donePayload = JSON.stringify({
                type: "done",
                conversationId: nextInteractionId,
              });
              controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
              controller.close();
            } catch (err: any) {
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
          },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Bun AI server listening on http://localhost:${PORT}`);