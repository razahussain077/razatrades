# SwiftLabor.ai — MT5 Market Intelligence v0.3

MT5-first market research terminal: Next.js dashboard, TradingView Lightweight Charts, FastAPI ingestion/analysis worker, and a read-only MetaTrader 5 Expert Advisor bridge.

## Truthful connection status

The Vercel dashboard is deployed at https://swiftlabor-forex-intelligence-app.vercel.app. The Render worker and client Equiti terminal are **not yet connected**. The dashboard now displays no synthetic candle prices or generated trade signals. It waits for broker snapshots and publishes market assessments only from fresh MT5 candles.

This is a private, client-specific broker feed. Equiti's symbol names, suffixes, bid/ask, spread and Market Watch universe are discovered from the authenticated MT5 terminal; the assistant does not need an MT5 password or investor password. Never put a broker login password in the EA, GitHub, this chat or Vercel.

## Architecture

Client's Equiti MT5 Desktop/VPS -> read-only SwiftLaborBridge EA -> authenticated HTTPS POST -> FastAPI worker -> Vercel dashboard.

The EA transmits OHLC candles, tick volume, symbol metadata, bid/ask, spread, quote timestamp and broker server label. It does not transmit account credentials, balance or positions and does not place, modify or close trades.

## Deploy the worker

1. In Render, choose New > Blueprint and select repository `razahussain077/razatrades`, branch `main`.
2. Render detects root `render.yaml` and provisions the FastAPI Docker service. The Blueprint is on the free plan for an initial preview; use an always-on paid service for production continuity.
3. Copy the generated `BRIDGE_TOKEN` from Render's private environment. Never commit it to GitHub or send it in chat.
4. Note the worker's HTTPS base URL. Confirm `/health` returns status ok.
5. In Vercel project settings, set `NEXT_PUBLIC_WORKER_API_URL` to the worker base URL and redeploy. CORS is configured to the production dashboard origin.

The worker's current in-memory cache is intentionally simple for the first live proof of concept. A worker restart clears its cache and MT5 must republish snapshots. Before a commercial multi-user rollout, add persistent time-series storage, client-level authentication, per-client feed isolation, rate limits and monitoring.

## Connect Equiti MT5

1. Client logs in to their own Equiti MT5 Desktop terminal. Do not ask them to send account credentials.
2. In MT5, choose File > Open Data Folder > MQL5 > Experts.
3. Copy `bridge/SwiftLaborBridge.mq5` to that Experts folder.
4. Open MetaEditor (F4), open the EA and compile (F7).
5. In MT5, open Tools > Options > Expert Advisors. Enable "Allow WebRequest for listed URL" and add the worker HTTPS base URL.
6. Attach the EA to a chart. Set `InpWorkerUrl` and `InpBridgeToken` using values stored privately in Render and the terminal. Leave `InpSymbols` blank to send all Market Watch symbols, or specify exact comma-separated broker names such as `EURUSD.a,XAUUSD,US30`.
7. Set the timeframe input. Use separate EA instances on separate charts for M15, H1 and H4 if all three are required. Begin with a short symbol list and one timeframe to validate throughput.
8. Check the Experts tab for successful HTTP responses.

## Verify live data

- `GET /health`
- `GET /api/status` — expect `broker_market_streams > 0`, `broker_symbols > 0`
- `GET /api/universe` — exact symbols read from MT5 Market Watch
- `GET /api/market/{exact-symbol}?timeframe=M15` — expect `data_mode = broker`
- `GET /api/signals?data_mode=broker` — only current broker-data assessments

## Current analysis scope

The explainable rules engine evaluates completed broker candles for a 20-bar sweep-and-reclaim candidate, directional displacement, a short-term structure break, a three-candle imbalance candidate, spread relative to ATR and quote freshness. The score is an evidence weighting, not a calibrated probability, expected return or promise of profitability. Liquidity levels shown on the chart are price-extreme candidates, not the global OTC order book, dealer inventory or other traders' stop orders.

There is no connected generative AI model in this build. The dashboard clearly labels the deterministic rules engine instead of pretending that AI commentary has run. An AI commentary layer requires a configured model provider/API key and a separately evaluated prompt and output-validation system.

## Reliability and safety

- EA is read-only; no trade execution code exists.
- MT5 terminal and its host computer/VPS must remain running for continuous data.
- A free preview worker is not a production 24/7 guarantee. Use an always-on worker and persistent storage before relying on continuous coverage.
- Broker CFD/OTC quotes can differ from other brokers and are not a consolidated global market tape.
- Backtest and forward-test the rules over multiple instruments/regimes before considering any live-trading use.
