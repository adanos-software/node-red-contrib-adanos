# Adanos nodes for Node-RED

Use the [Adanos Market Sentiment API](https://api.adanos.org/docs) in Node-RED flows. The package provides focused nodes for stock details, crypto details, trending assets, and comparisons across Reddit, News, X/Twitter, and Polymarket.

## Install

Install from the Node-RED Palette Manager by searching for `node-red-contrib-adanos`, or run this command in the Node-RED user directory:

```bash
npm install node-red-contrib-adanos
```

Node.js 18 or newer and Node-RED 4 or newer are required.

## Configure

1. Add any Adanos node to a flow.
2. Create an **Adanos API** configuration from its **API** field.
3. Enter your Adanos API key and deploy the flow.

The API key is stored as a Node-RED credential. It is not included when flows are exported.

## Nodes

| Node | Purpose |
| --- | --- |
| **Adanos stock** | Detailed stock sentiment from Reddit, News, X/Twitter, or Polymarket |
| **Adanos crypto** | Detailed Reddit sentiment for a crypto token |
| **Adanos trending** | Trending stocks or crypto tokens for a selected market |
| **Adanos compare** | Compare up to 10 stock tickers or crypto symbols |

Each node preserves the incoming message and writes the exact SDK response to `msg.payload`. If `msg.topic` is empty, the node sets a topic such as `adanos/reddit/stock/TSLA`.

## Inputs and overrides

Ticker, symbol, and compare assets use Node-RED typed inputs. They may come from the message, a literal value, flow/global context, or an environment variable. Compare assets may be an array or a comma-separated string.

Optional request settings can be configured on the node or overridden per message:

```json
{
  "ticker": "NVDA",
  "adanos": {
    "from": "2026-07-01",
    "to": "2026-07-07",
    "limit": 10,
    "offset": 0
  }
}
```

Supported `msg.adanos` fields:

- All nodes: `from`, `to`, `days`
- Trending: `limit`, `offset`
- News trending: `source`
- Polymarket trending: `type`

Use `from`/`to` for an explicit inclusive UTC date window. Alternatively, use `days`; `days` may be combined with `to`, but not with `from`.

## Errors and status

The nodes show their latest state below the node:

- Blue dot: request in progress
- Green dot: response received
- Red ring: invalid input or API failure

Errors are passed to Node-RED's standard error handling, so a Catch node can route them without stopping the runtime.

## Example flow

Open **Import → Examples → node-red-contrib-adanos → Adanos market sentiment** after installation. Configure its **Adanos API** credential before deploying.

## Development

```bash
npm install
npm test
npm run check
```

For local Node-RED testing, run this from the Node-RED user directory and restart Node-RED:

```bash
npm install /absolute/path/to/node-red-contrib-adanos
```

The runtime uses the public [`finance-sentiment`](https://www.npmjs.com/package/finance-sentiment) SDK rather than duplicating Adanos API request logic.

## License

MIT
