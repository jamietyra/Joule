"""Joule demo — Cut 1 (BaseURLDiff).

The only difference from a stock OpenAI call is the `base_url`.
That single line is the entire integration: Joule intercepts the request,
classifies intent, auto-routes to Crusoe Nemotron Nano or Super, measures
carbon and cost, and returns an OpenAI-compatible response.

Prerequisites:
    pip install openai
    npm run dev   # Joule core listening on http://localhost:3001

Run:
    python demo.py
"""

from openai import OpenAI

# Before: direct OpenAI call (commented out — never executed)
# client = OpenAI(api_key="sk-...", base_url="https://api.openai.com/v1")

# After: route through Joule — the one-line change
client = OpenAI(api_key="any", base_url="http://localhost:3001/v1")

response = client.chat.completions.create(
    model="any",
    messages=[
        {
            "role": "user",
            "content": "Summarize in one sentence: Joule is a carbon-aware AI gateway.",
        }
    ],
)

print(response.choices[0].message.content)
