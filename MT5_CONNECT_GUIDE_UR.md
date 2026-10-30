# SwiftLabor.ai MT5 connection guide (Roman Urdu)

## Data flow
Client broker -> MT5 Desktop -> SwiftLaborBridge.mq5 (read-only EA) -> Render worker -> Vercel dashboard.

## Pehle worker deploy karein
1. Render mein New > Blueprint select karein.
2. GitHub repo razahussain077/razatrades select karein aur branch main choose karein.
3. Render root render.yaml ko detect karega. Free plan sirf preview ke liye hai; service 15 minute inbound traffic na aaye to sleep kar sakti hai.
4. Create/Apply karne ke baad generated BRIDGE_TOKEN ko Render Environment se copy karein. Isay chat ya GitHub mein kabhi share na karein.
5. Service ka HTTPS URL note karein, misal https://your-worker.onrender.com.

## MT5 EA install
1. Client apne Windows computer par MT5 Desktop mein apne broker demo account se login kare.
2. MT5 > File > Open Data Folder > MQL5 > Experts.
3. SwiftLaborBridge.mq5 ko Experts folder mein copy karein.
4. F4 se MetaEditor kholein, file open karein, F7 se compile karein.
5. MT5 > Tools > Options > Expert Advisors mein Allow WebRequest for listed URL enable karein; worker ka base URL add karein.
6. EA ko chart par attach karein. Inputs mein worker URL, private bridge token, broker ke exact symbol names aur M15 timeframe set karein.
7. Market Watch mein symbols EURUSD, EURUSD.a ya EURUSDm ho sakte hain. Exact broker spelling use karein.
8. Experts/Journal tab mein errors check karein. EA sirf OHLC candles bhejta hai; order place nahi karta.

## Verify
- https://YOUR-WORKER/health
- https://YOUR-WORKER/api/status
- https://YOUR-WORKER/api/market/EURUSD?timeframe=M15

Status mein broker_market_streams > 0 aur market endpoint mein data_mode broker hona chahiye.

Never send MT5 master/investor password in chat. The bridge token is separate and belongs only in Render environment and local EA inputs.
