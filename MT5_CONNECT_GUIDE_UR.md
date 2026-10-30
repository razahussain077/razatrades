# SwiftLabor.ai — Equiti MT5 Connection Guide (Roman Urdu)

## System ka data flow

Equiti MT5 Desktop/VPS -> SwiftLaborBridge EA -> HTTPS worker -> SwiftLabor.ai dashboard.

EA sirf read-only market information bhejta hai: candles, tick volume, symbol details, bid/ask, spread aur broker server label. EA kisi trade ko open, modify ya close nahi karta.

## Step 1 — Worker deploy karein

1. Render.com par New > Blueprint kholein.
2. GitHub repository `razahussain077/razatrades` aur branch `main` select karein.
3. Root ka `render.yaml` Render service banayega. Abhi preview ke liye free plan hai; continuous production service ke liye always-on paid plan use karein.
4. Render Environment mein auto-generated `BRIDGE_TOKEN` milega. Isay private rakhein; GitHub ya chat mein kabhi paste na karein.
5. Worker ka HTTPS URL note karein, misal `https://your-worker.onrender.com`.
6. Browser mein `https://your-worker.onrender.com/health` kholein. `status: ok` aana chahiye.

## Step 2 — Vercel dashboard ko worker se jorein

Vercel project `swiftlabor-forex-intelligence-app` ke Environment Variables mein `NEXT_PUBLIC_WORKER_API_URL` set karein, value worker ka HTTPS base URL ho. Production redeploy karein. Trailing slash na lagayein.

## Step 3 — Client ke Equiti MT5 par EA lagayein

1. Client apne computer par Equiti MT5 open kare aur khud apne account mein login kare. Account number/password humein na bheje.
2. MT5 mein File > Open Data Folder > MQL5 > Experts par jayein.
3. Repository ka `bridge/SwiftLaborBridge.mq5` file Experts folder mein copy karein.
4. F4 se MetaEditor kholein; file open karke F7 press karein. Compilation error nahi honi chahiye.
5. MT5 > Tools > Options > Expert Advisors mein "Allow WebRequest for listed URL" enable karein aur worker ka poora HTTPS base URL add karein.
6. EA ko kisi chart par attach karein. Inputs mein `InpWorkerUrl` aur private `InpBridgeToken` set karein.
7. `InpSymbols` blank chhorne par EA Market Watch ke tamam visible symbols bhejega. Pehle test ke liye exact short list de sakte hain, misal `EURUSD.a,XAUUSD,US30`. Equiti mein symbol suffix alag ho sakta hai; exact spelling Market Watch se copy karein.
8. `InpTimeframe` pehle M15 rakhein. H1 aur H4 bhi chahiye hon to un timeframes ke liye alag chart par EA ki alag instance attach karein.
9. MT5 ke Experts tab mein HTTP response aur errors check karein.

## Step 4 — Live connection verify karein

Worker endpoints:
- `/api/status` — `broker_market_streams` aur `broker_symbols` zero se zyada hon.
- `/api/universe` — MT5 se aane wale actual symbol names dekhein.
- `/api/market/EURUSD.a?timeframe=M15` — apne broker ke exact symbol se test karein; `data_mode` broker hona chahiye.
- `/api/signals?data_mode=broker` — fresh broker candles par analysis.

## Important baatein

- Broker ka master/investor password, account number, OTP ya remote access credentials chat mein share na karein.
- Private bridge token sirf Render environment aur client ke MT5 EA Inputs mein use hoga.
- Client ka MT5 computer/VPS band hua to data feed ruk jayegi. 24/7 coverage ke liye MT5 ko always-on Windows VPS par chalana hoga, aur backend worker bhi always-on hona chahiye.
- Dashboard mein synthetic/demo prices nahi dikhaye jate. Jab tak live broker candles nahi aate, woh wait state dikhata hai.
- Current analysis explainable rules engine hai, generative AI nahi. Score probability ya guaranteed profit nahi hota.
- Liquidity sweep aur chart levels price-action estimates hain; humein Equiti/dealer ka hidden order book ya market-wide stop-loss data nahi milta.
- Read-only EA hai; autotrading disabled hai.
