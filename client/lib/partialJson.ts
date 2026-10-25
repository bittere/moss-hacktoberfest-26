export function tryParsePartialJson(input: string): any {
  if (!input.trim()) return null;

  try {
    return JSON.parse(input);
  } catch {
    // If invalid, balance unclosed quotes and brackets
    let repaired = input.trim();
    let inString = false;
    let isEscaped = false;
    const stack: string[] = [];

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === "\\" && inString) {
        isEscaped = !isEscaped;
        continue;
      }
      if (char === '"' && !isEscaped) {
        inString = !inString;
      } else if (!inString) {
        if (char === "{") stack.push("}");
        else if (char === "[") stack.push("]");
        else if (char === "}" || char === "]") {
          if (stack.length && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
      isEscaped = false;
    }

    if (inString) repaired += '"';
    while (stack.length) repaired += stack.pop();

    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}