# Interface Intelligence

> Note: yes, the generation is slow, and that's only because this is running on a free inference API.

Nobody can deny that LLMs are not powerful. Anthropic estimates that 25% of all open-source code on GitHub is written by AI, and this number is only going to grow in the future.

Today, LLMs are so powerful that they can efficiently zero-shot generate code with almost no syntax/logical errors. LLMs are being used worldwide in every organisation to write, edit or evaluate code at some level.

And yet, despite all this innovation, the primary way humans interact with LLMs is through text. Why?

Why are we restricting our LLM interaction to just text? Why are we limiting the model’s capabilities of generating rich, dynamic UIs to just plain old boring text?

Interface Intelligence is an experiment into AI-generated widgets for communication instead of text. Have a question? An LLM generates a visual explainer. Need to check the weather? Not just a line of text, an interactive chart with icons and tabs. Interfaces should be the primary channel of interaction, not text.

Using Gemma 4’s brilliant intelligence-per-parameter ratio, interfaces are generated via JSON (which the model nails generating almost every time).

This repo is a demo/proof-of-concept using Gemma 4 31B as the model