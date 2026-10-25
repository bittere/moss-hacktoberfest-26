/**
 * Robustly parses full or partially streamed JSON from LLM outputs.
 * Handles markdown fences, preamble/postamble prose, unclosed structures,
 * literal newlines, single quotes, unquoted keys, and Python constants.
 */
export function tryParsePartialJson<T = any>(input: string): T | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Fast path: Direct parse for already-valid complete JSON or primitives
  try {
    return JSON.parse(trimmed);
  } catch {
    // Proceed to extraction and auto-repair
  }

  // 2. Extract candidate JSON block from surrounding text / markdown
  const candidate = extractJsonCandidate(trimmed);

  // Direct parse attempt on extracted candidate
  try {
    return JSON.parse(candidate);
  } catch {
    // Proceed to deep repair
  }

  // 3. Deep auto-repair for streaming / malformed JSON
  try {
    const repaired = repairJson(candidate);
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

/**
 * Strips conversational preamble, postamble, markdown code blocks,
 * and citation markers like `[1]` to locate the JSON payload.
 */
function extractJsonCandidate(text: string): string {
  // 1. Check for markdown code fences (even if unclosed during streaming)
  const fenceMatch = /```(?:json[a-z]*|json5|jsonc)?\s*([\s\S]*?)(?:```|$)/i.exec(text);
  if (fenceMatch && fenceMatch[1].trim()) {
    const insideFence = fenceMatch[1].trim();
    if (insideFence.includes("{") || insideFence.includes("[")) {
      return insideFence;
    }
  }

  // 2. Find the first '{' or '['
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");

  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    // If '[' comes before '{', ensure it isn't a citation reference like "[1]" or markdown link "[text]("
    if (firstBracket < firstBrace) {
      const sliceBetween = text.slice(firstBracket, firstBrace);
      if (/^\[\s*\d+\s*\]/.test(sliceBetween) || /^\[[^\]]*\]\(/.test(sliceBetween)) {
        startIdx = firstBrace;
      } else {
        startIdx = firstBracket;
      }
    } else {
      startIdx = firstBrace;
    }
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx !== -1) {
    return text.slice(startIdx);
  }

  return text;
}

/**
 * State-machine repairer for incomplete and malformed JSON.
 */
function repairJson(input: string): string {
  // Normalize smart quotes
  const normalized = input
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  let repaired = "";
  let inString: '"' | "'" | false = false;
  let isEscaped = false;

  const stack: string[] = [];
  const contextStack: Array<{
    type: "object" | "array";
    hasColon: boolean;
    inKey: boolean;
    keyStartIdx: number;
  }> = [];

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const currentContext = contextStack[contextStack.length - 1];

    // --- INSIDE STRING ---
    if (inString) {
      if (char === "\\") {
        if (!isEscaped) {
          isEscaped = true;
          continue;
        } else {
          // Escaped backslash: "\\"
          repaired += "\\\\";
          isEscaped = false;
          continue;
        }
      }

      if (isEscaped) {
        if (inString === "'" && char === "'") {
          // Escaped single quote inside single-quoted string -> literal single quote
          repaired += "'";
        } else {
          repaired += "\\" + char;
        }
        isEscaped = false;
        continue;
      }

      // Check for string close
      if (char === inString) {
        inString = false;
        repaired += '"';
        continue;
      }

      // Handle unescaped control characters inside string literals (JSON spec violation)
      if (char === "\n") {
        repaired += "\\n";
        continue;
      }
      if (char === "\r") {
        repaired += "\\r";
        continue;
      }
      if (char === "\t") {
        repaired += "\\t";
        continue;
      }

      // If we are normalizing a single-quoted string, double-quotes inside must be escaped
      if (inString === "'" && char === '"') {
        repaired += '\\"';
        continue;
      }

      repaired += char;
      continue;
    }

    // --- OUTSIDE STRING ---

    // 1. Skip comments outside strings
    if (char === "/" && normalized[i + 1] === "/") {
      i += 2;
      while (i < normalized.length && normalized[i] !== "\n" && normalized[i] !== "\r") i++;
      continue;
    }
    if (char === "/" && normalized[i + 1] === "*") {
      i += 2;
      while (i < normalized.length && !(normalized[i] === "*" && normalized[i + 1] === "/")) i++;
      i++;
      continue;
    }

    // 2. Normalize Python literals outside strings
    if (!currentContext || !currentContext.inKey) {
      if (normalized.startsWith("True", i) && !/[a-zA-Z0-9_$]/.test(normalized[i + 4] || "")) {
        repaired += "true";
        i += 3;
        continue;
      }
      if (normalized.startsWith("False", i) && !/[a-zA-Z0-9_$]/.test(normalized[i + 5] || "")) {
        repaired += "false";
        i += 4;
        continue;
      }
      if (normalized.startsWith("None", i) && !/[a-zA-Z0-9_$]/.test(normalized[i + 4] || "")) {
        repaired += "null";
        i += 3;
        continue;
      }
    }

    // 3. Handle unquoted keys: `{ key: "value" }`
    if (currentContext?.type === "object" && currentContext.inKey && /[a-zA-Z_$]/.test(char)) {
      let ident = "";
      while (i < normalized.length && /[a-zA-Z0-9_$-]/.test(normalized[i])) {
        ident += normalized[i];
        i++;
      }
      let ws = "";
      while (i < normalized.length && /\s/.test(normalized[i])) {
        ws += normalized[i];
        i++;
      }
      if (i < normalized.length && normalized[i] === ":") {
        repaired += `"${ident}"${ws}:`;
        currentContext.hasColon = true;
        currentContext.inKey = false;
        continue;
      } else {
        if (i >= normalized.length) break; // Truncated mid-unquoted key
        repaired += ident + ws;
        i--;
        continue;
      }
    }

    // 4. String entry
    if (char === '"' || char === "'") {
      inString = char;
      if (currentContext?.type === "object") {
        if (!currentContext.hasColon) {
          currentContext.inKey = true;
          currentContext.keyStartIdx = repaired.length;
        } else {
          currentContext.inKey = false;
        }
      }
      repaired += '"';
      continue;
    }

    // 5. Structure delimiters
    if (char === "{") {
      stack.push("}");
      contextStack.push({
        type: "object",
        hasColon: false,
        inKey: true,
        keyStartIdx: repaired.length + 1,
      });
      repaired += char;
      continue;
    }

    if (char === "[") {
      stack.push("]");
      contextStack.push({
        type: "array",
        hasColon: false,
        inKey: false,
        keyStartIdx: -1,
      });
      repaired += char;
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.length && stack[stack.length - 1] === char) {
        stack.pop();
        contextStack.pop();
        // Clean trailing comma before closing brace/bracket
        repaired = repaired.replace(/,\s*$/, "");
        repaired += char;

        // If root container has closed, anything remaining is postamble prose
        if (stack.length === 0) {
          break;
        }
        continue;
      }
    }

    if (char === ":") {
      if (currentContext?.type === "object") {
        currentContext.hasColon = true;
        currentContext.inKey = false;
      }
      repaired += char;
      continue;
    }

    if (char === ",") {
      if (currentContext?.type === "object") {
        currentContext.hasColon = false;
        currentContext.inKey = true;
        currentContext.keyStartIdx = repaired.length + 1;
      }
      // Avoid consecutive commas
      repaired = repaired.replace(/,\s*$/, "");
      repaired += char;
      continue;
    }

    repaired += char;
  }

  // --- EOF CLEANUP / AUTO-REPAIR ---

  if (inString) {
    const currentContext = contextStack[contextStack.length - 1];
    if (currentContext && currentContext.type === "object" && currentContext.inKey) {
      // Stream cut off mid-key: drop the incomplete key and preceding comma
      repaired = repaired.slice(0, currentContext.keyStartIdx).trimEnd();
      repaired = repaired.replace(/,\s*$/, "");
    } else {
      // Stream cut off mid-value: clean trailing escapes and close quote
      if (isEscaped) {
        repaired = repaired.slice(0, -1);
      }
      // Remove truncated unicode escape: \u, \u1, \u12, \u123
      repaired = repaired.replace(/\\u[0-9a-fA-F]{0,3}$/, "");
      repaired += '"';
    }
  } else {
    // Trailing colon: `{"key": ` -> `{"key": null}`
    if (/:\s*$/.test(repaired)) {
      repaired += "null";
    }

    // Trailing comma
    repaired = repaired.replace(/,\s*$/, "");

    // Incomplete boolean / null primitives at EOF
    repaired = repaired
      .replace(/([:,\s\[]|^)t(?:r(?:u)?)?$/i, "$1true")
      .replace(/([:,\s\[]|^)f(?:a(?:l(?:s)?)?)?$/i, "$1false")
      .replace(/([:,\s\[]|^)n(?:u(?:l)?)?$/i, "$1null");

    // Incomplete numeric values at EOF
    repaired = repaired
      .replace(/(\d+)\.\s*$/, "$1.0")
      .replace(/([:,\s\[]|^)-\s*$/, "$10")
      .replace(/(\d+)[eE][+-]?\s*$/, "$1");
  }

  // Final comma strip before balancing brackets
  repaired = repaired.replace(/,\s*$/, "");

  // Close remaining unclosed containers
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
}