import { useState } from "react";
import { PromptComposer } from "@/components/ui/prompt-composer";

export default function App() {
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const prompt = value.trim();
    if (!prompt || isLoading) return;

    setIsLoading(true);

    try {
      console.log("Submitting prompt:", prompt);

      // Simulate an AI response / API request
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Clear prompt input after successful submission
      setValue("");
    } catch (error) {
      console.error("Error submitting prompt:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-2xl">
        <PromptComposer
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onSend={handleSubmit}
          isLoading={isLoading}
          loadingText="Thinking…"
          placeholder="Ask anything or type a prompt…"
          rows={2}
        />
      </div>
    </main>
  );
}