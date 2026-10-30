# SwiftLabor.ai — MT5 Forex Intelligence v0.2

Blue-and-white forex research terminal with a Next.js dashboard, interactive TradingView Lightweight Charts, Python/FastAPI analysis worker, and read-only MT5 Expert Advisor bridge.

## Status and limitations

The Vercel dashboard is deployed at https://swiftlabor-forex-intelligence.vercel.app. The Render worker and MT5 bridge are not yet connected. Until the client terminal publishes candles, the dashboard uses synthetic demo prices. The rules engine is a research prototype, not a validated profitable strategy. It cannot see dealer private orders, market-wide stop-losses, or global OTC order flow. No order-placement code is present.

## Deploy worker

Import this repository's root-level render.yaml as a Render Blueprint. The Blueprint uses a Docker web service in Singapore, with an automatically generated BRIDGE_TOKEN and /health check. On the free compute plan, Render services spin down after 15 minutes without inbound traffic and can restart at any time; this is suitable for preview, not a dependable always-on production feed. A continuously running service requires a paid compute plan. See https://render.com/docs/free and https://render.com/docs/blueprint-spec.

After deploy, keep BRIDGE_TOKEN private. Set CORS_ORIGINS to the exact Vercel origin and copy the worker HTTPS URL into Vercel's NEXT_PUBLIC_WORKER_API_URL environment variable.

## Run locally

Worker: cd worker, pip install -r requirements.txt, set BRIDGE_TOKEN and CORS_ORIGINS, then uvicorn main:app --reload --port 8000.
Frontend: npm install, set NEXT_PUBLIC_WORKER_API_URL, then npm run dev.

## MT5

Copy bridge/SwiftLaborBridge.mq5 to MT5 Data Folder/MQL5/Experts, compile in MetaEditor, allow the worker HTTPS domain in Tools > Options > Expert Advisors > WebRequest, and attach it to a chart. Configure URL, private bridge token and the broker's exact symbols. The EA publishes OHLC candles only and never places orders. Account passwords must never be shared.

## Endpoints

- GET /health
- GET /api/status
- GET /api/market/{symbol}?timeframe=M15
- GET /api/signals?data_mode=broker
- POST /ingest/mt5 (X-Bridge-Token)

The worker keeps recent candles in memory. A service restart requires MT5 to send the next snapshot to repopulate the cache. Add PostgreSQL/TimescaleDB before commercial history and trade-journal features. Signals require a sweep candidate, same-direction displacement and short-term structure break; scores are evidence scores, not probabilities of profit.
