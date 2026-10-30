from __future__ import annotations
import asyncio, hmac, logging, os, re, time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from analysis import analyze_market

logging.basicConfig(level=os.getenv("LOG_LEVEL","INFO"))
log = logging.getLogger("swiftlabor.worker")
BRIDGE_TOKEN = os.getenv("BRIDGE_TOKEN","")
SCAN_INTERVAL = max(5,int(os.getenv("SCAN_INTERVAL_SECONDS","15")))
STALE_AFTER = max(30,int(os.getenv("STALE_AFTER_SECONDS","180")))
MAX_BARS = min(1000,max(50,int(os.getenv("MAX_BARS_PER_STREAM","250"))))
FRAMES = {"M1","M5","M15","M30","H1","H4","D1","W1"}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9._-]{3,24}$")
MARKET: dict[str,dict[str,Any]] = {}
SIGNALS: dict[str,dict[str,Any]] = {}
LAST_SCAN = None
LAST_FEED = None
TASK = None

class Candle(BaseModel):
    time: int = Field(gt=0)
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    tick_volume: float | None = Field(default=None,ge=0)
    @model_validator(mode="after")
    def valid_ohlc(self):
        if self.high < max(self.open,self.close,self.low) or self.low > min(self.open,self.close,self.high):
            raise ValueError("invalid OHLC candle")
        return self

class Payload(BaseModel):
    symbol: str = Field(min_length=3,max_length=24)
    timeframe: str
    bars: list[Candle] = Field(min_length=35,max_length=1000)
    @field_validator("symbol")
    @classmethod
    def valid_symbol(cls,v):
        v=v.strip().upper()
        if not SYMBOL_RE.fullmatch(v): raise ValueError("invalid symbol")
        return v
    @field_validator("timeframe")
    @classmethod
    def valid_frame(cls,v):
        v=v.strip().upper()
        if v not in FRAMES: raise ValueError("unsupported timeframe")
        return v
    @field_validator("bars")
    @classmethod
    def ordered(cls,v):
        times=[b.time for b in v]
        if times != sorted(times) or len(times)!=len(set(times)): raise ValueError("bars must be strictly ordered")
        return v

def iso(ts):
    return datetime.fromtimestamp(ts,tz=timezone.utc).isoformat() if ts else None
def key(symbol,frame): return f"{symbol.upper()}:{frame.upper()}"
def fresh():
    now=time.time()
    return {k:v for k,v in MARKET.items() if now-v["received_at"]<=STALE_AFTER}

async def scan_loop():
    global LAST_SCAN
    while True:
        try:
            for k,stream in fresh().items():
                bars=stream["bars"][:-1] if len(stream["bars"])>36 else stream["bars"]
                item=analyze_market(bars,stream["symbol"],stream["timeframe"])
                item.update({"evaluated_at":iso(time.time()),"data_mode":"broker","source_age_seconds":round(time.time()-stream["received_at"],2)})
                SIGNALS[k]=item
            LAST_SCAN=time.time()
        except asyncio.CancelledError: raise
        except Exception: log.exception("Analysis loop error")
        await asyncio.sleep(SCAN_INTERVAL)

@asynccontextmanager
async def lifespan(app):
    global TASK
    TASK=asyncio.create_task(scan_loop())
    yield
    TASK.cancel()
    try: await TASK
    except asyncio.CancelledError: pass

app=FastAPI(title="SwiftLabor.ai Market Intelligence Worker",version="0.2.0",lifespan=lifespan)
origins=[s.strip() for s in os.getenv("CORS_ORIGINS","https://swiftlabor-forex-intelligence.vercel.app").split(",") if s.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=False,allow_methods=["GET","POST","OPTIONS"],allow_headers=["Content-Type","X-Bridge-Token"])

@app.get("/")
async def root(): return {"service":"SwiftLabor.ai Market Intelligence Worker","status":"ok","docs":"/docs"}
@app.get("/health")
async def health(): return {"status":"ok","service":"swiftlabor-forex-worker","timestamp":iso(time.time())}
@app.get("/api/status")
async def status():
    streams=fresh()
    return {"process":"online","data_mode":"broker" if streams else "demo","broker_market_streams":len(streams),"last_scan_at":iso(LAST_SCAN),"last_feed_at":iso(max((v["received_at"] for v in streams.values()),default=LAST_FEED)),"scan_interval_seconds":SCAN_INTERVAL,"stale_after_seconds":STALE_AFTER,"execution_mode":"read_only","orders_enabled":False,"engine":"swiftlabor-rules-v0.2"}
@app.post("/ingest/mt5")
async def ingest(payload:Payload,x_bridge_token:str|None=Header(default=None)):
    global LAST_FEED
    if not BRIDGE_TOKEN: raise HTTPException(503,"Bridge ingestion is not configured.")
    if not x_bridge_token or not hmac.compare_digest(x_bridge_token,BRIDGE_TOKEN): raise HTTPException(401,"Invalid bridge token.")
    bars=[b.model_dump() for b in payload.bars[-MAX_BARS:]]
    now=time.time()
    if bars[-1]["time"]>now+300: raise HTTPException(422,"Latest candle timestamp is in the future.")
    MARKET[key(payload.symbol,payload.timeframe)]={"symbol":payload.symbol,"timeframe":payload.timeframe,"bars":bars,"received_at":now,"last_bar_at":bars[-1]["time"]}
    LAST_FEED=now
    log.info("Received %s %s candles=%s",payload.symbol,payload.timeframe,len(bars))
    return {"accepted":True,"symbol":payload.symbol,"timeframe":payload.timeframe,"bars_received":len(bars),"received_at":iso(now),"data_mode":"broker","execution_mode":"read_only"}
@app.get("/api/market/{symbol}")
async def market(symbol:str,timeframe:str="M15"):
    symbol=symbol.strip().upper(); timeframe=timeframe.strip().upper()
    if not SYMBOL_RE.fullmatch(symbol) or timeframe not in FRAMES: raise HTTPException(422,"Invalid symbol or timeframe.")
    item=fresh().get(key(symbol,timeframe))
    if not item: return {"symbol":symbol,"timeframe":timeframe,"data_mode":"demo","bars":[],"updated_at":None}
    return {"symbol":symbol,"timeframe":timeframe,"data_mode":"broker","bars":item["bars"],"updated_at":iso(item["received_at"]),"last_bar_at":item["last_bar_at"],"source_age_seconds":round(time.time()-item["received_at"],2)}
@app.get("/api/signals")
async def signals(data_mode:str|None=None):
    active=set(fresh())
    items=[v for k,v in SIGNALS.items() if k in active]
    if data_mode=="broker": items=[v for v in items if v.get("data_mode")=="broker"]
    items.sort(key=lambda x:(x.get("score",0),x.get("evaluated_at") or ""),reverse=True)
    return {"items":items,"count":len(items),"data_mode":"broker" if items else "demo"}
@app.get("/api/stream-keys")
async def stream_keys(): return {"items":sorted(fresh())}
