# n8n-nodes-octen-official

An [n8n](https://n8n.io/) community node for the [Octen](https://octen.ai) API. Search the web, news, companies, places, images, videos and designs, and extract the content of web pages, in your workflows or as a tool for the n8n AI Agent.

[Installation](#installation) ·
[Credentials](#credentials) ·
[Operations](#operations) ·
[Usage](#usage) ·
[AI Agent](#use-octen-as-an-ai-agent-tool) ·
[Compatibility](#compatibility) ·
[Resources](#resources)

## Installation

Installing community nodes requires the instance owner or an admin.

- **From the nodes panel** (n8n Cloud and self-hosted): search for **Octen** and select **Install**. Only nodes verified by n8n appear here.
- **Self-hosted, from settings**: go to **Settings > Community Nodes**, select **Install**, and enter `n8n-nodes-octen-official`.

See the n8n guide to [installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/) for details.

## Credentials

1. Create an API key on the [Octen API Platform](https://octen.ai/platform/api-keys).
2. In n8n, create an **Octen API** credential and paste the key.

n8n checks the key when you save the credential.

## Operations

| Operation | What it returns |
| --- | --- |
| Web Search | Ranked web pages with highlights |
| Web Search Premier | Ranked web pages from the Premier engine, for harder queries |
| Broad Search | Results for several sub-queries generated from your query |
| News Search | Recent news articles, grouped into subjects |
| Business Search | Web results about companies and people, with entity cards |
| Pulse Search | Fast web results for real-time use |
| Place Search | Place cards for businesses and points of interest, with optional web results |
| Image Search | Images that match a description or look like a given image |
| Video Search | Videos that match a description. Needs Video Search access: contact Octen to request it |
| Design Search | Web page, app screen and slide designs, with optional web results |
| Extract | The content of up to 20 web pages |

Each operation has an **Options** list with the filters its API takes, such as result count, domains, time range, language, highlights and full page content. Options you leave out use the API defaults. See the [Octen API reference](https://docs.octen.ai/) for what each option does.

## Usage

**Simplify** is on by default. Each result becomes one n8n item with its main fields and a `type`:

| `type` | Comes from | Main fields |
| --- | --- | --- |
| `web` | Search results of every search operation | `title`, `url`, `highlight`, `time_published` |
| `subject` | News Search | `name`, `summary`, `time_latest`, `top_news`, `sub_news` |
| `entity` | Business Search | The full entity card, with `entity_type` (`company` or `person`) |
| `place` | Place Search | `name`, `address`, `rating`, `review_count`, `distance`, `phone`, `website` |
| `image` | Image Search | `title`, `url`, `source_page`, `width`, `height` |
| `video` | Video Search | `title`, `url`, `source_page`, `duration_seconds` |
| `design` | Design Search | `title`, `url`, `source_page`, `group` (its `group_id` works as the **Group ID** option), `design_facts`, `snippet` |
| `page` | Extract | `url`, `status`, `title`, `full_content` or `highlights` |

Content you turn on in the options, such as full page content, images or links, is kept. Turn **Simplify** off to get the full API response as a single item. When a search finds nothing, the node outputs no items.

Each input item runs one request. To keep the workflow going when a request fails, set the node's **On Error** setting to continue; the failed item then outputs `{ "error": "<message>" }`.

## Use Octen as an AI Agent tool

Connect the Octen node to the **Tool** input of an AI Agent. Pick the operation the agent should use, and set **Query** (or **URLs** for Extract) to be defined by the model. Add one Octen tool per operation you want the agent to have. Simplify keeps the results short, which saves tokens.

The [example workflows](examples/) include an agent that searches news and answers with sources.

## Compatibility

Requires n8n 1.123 or later.

## Resources

- [Octen documentation](https://docs.octen.ai/)
- [Octen API Platform](https://octen.ai/platform/api-keys)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
