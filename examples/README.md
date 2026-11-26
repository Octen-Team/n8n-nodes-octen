# Example workflows

Import a workflow in n8n with **Import from File** in the workflow menu, then select your credentials in the nodes that need them.

| File | What it does |
| --- | --- |
| [ai-agent-news.json](ai-agent-news.json) | A chat agent that searches news with Octen and answers with sources. Needs an OpenAI credential, or change the chat model node to another model. |
| [daily-news.json](daily-news.json) | Searches the past day's news on a topic every morning at 8. Add the nodes that send or store the results. |
