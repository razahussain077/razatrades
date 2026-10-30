"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, AlertTriangle, BrainCircuit, CandlestickChart, Clock3, Gauge,
  LayoutDashboard, Radio, ScanSearch, Search, Settings2, ShieldCheck,
  Target, Waves, RefreshCw, ChevronRight
} from "lucide-react";
import {
  CandlestickSeries, ColorType, CrosshairMode, createChart, type Time
} from "lightweight-charts";

type Bar = { time: number; open: number; high: number; low: number; close: number; tick_volume?: number };
type MarketItem = {
  symbol: string; asset_class: string; description: string; timeframes: string[];
  last_price: number; bid?: number; ask?: number; spread_points?: number; digits?: number;
  quote_age_seconds: number; quote_fresh: boolean; broker_server?: string | null;
};
type Signal = {
  symbol: string; timeframe: string; side: string; score: number; reason: string;
  evidence: string[]; invalidation?: number | null; evaluated_at?: string;
  quote_age_seconds?: number; spread_to_atr?: number | null;
};
type Status = {
  process?: string; data_mode?: string; broker_market_streams?: number; broker_symbols?: number;
  fresh_quotes?: number; symbols?: string[]; last_feed_at?: string | null;
  last_scan_at?: string | null; scan_interval_seconds?: number; execution_mode?: string;
  orders_enabled?: boolean; engine?: string;
};
const FRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
const API = (process.env.NEXT_PUBLIC_WORKER_API_URL || "").replace(/\/$/, "");
const NAV = [
  ["Overview", LayoutDashboard], ["Market scanner", ScanSearch],
  ["Liquidity map", Waves], ["Signal center", Target],
  ["AI analyst", BrainCircuit], ["Risk & journal", ShieldCheck],
] as const;
const money = (value: number | null | undefined, digits = 5) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(Math.max(0, Math.min(10, digits))) : "—";
const timeLabel = (value?: string | null) => value ? new Date(value).toLocaleTimeString() : "—";
const ageLabel = (age?: number) => typeof age === "number" ? (age < 60 ? age + "s ago" : Math.floor(age / 60) + "m ago") : "—";

export default function Home() {
  const [section, setSection] = useState<string>("Overview");
  const [symbol, setSymbol] = useState<string>("EURUSD");
  const [frame, setFrame] = useState<string>("M15");
  const [status, setStatus] = useState<Status | null>(null);
  const [universe, setUniverse] = useState<MarketItem[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [search, setSearch] = useState("");
  const [chartBars, setChartBars] = useState(false);
  const [chartMeta, setChartMeta] = useState<{source:string;updated:string;quoteAge?:number;bid?:number;ask?:number;spread?:number;digits?:number}>({source:"Waiting for broker feed",updated:"No broker candles received"});
  const [loading, setLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const chartEl = useRef<HTMLDivElement>(null);

  const selected = universe.find(item => item.symbol === symbol);
  const activeSignal = signals.find(item => item.symbol === symbol && item.timeframe === frame);
  const filtered = useMemo(() => universe.filter(item =>
    (item.symbol + " " + item.description + " " + item.asset_class).toLowerCase().includes(search.toLowerCase())
  ), [universe, search]);
  const streamCount = status?.broker_market_streams || 0;
  const feedConnected = streamCount > 0;
  const workerOnline = status?.process === "online";

  useEffect(() => {
    if (!API) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const [s, u, a] = await Promise.all([
          fetch(API + "/api/status", { cache: "no-store" }),
          fetch(API + "/api/universe", { cache: "no-store" }),
          fetch(API + "/api/signals?data_mode=broker", { cache: "no-store" }),
        ]);
        if (!s.ok || !u.ok || !a.ok) throw new Error("Worker API returned an error");
        const [nextStatus, nextUniverse, nextSignals] = await Promise.all([s.json(), u.json(), a.json()]);
        if (stopped) return;
        setStatus(nextStatus);
        setUniverse(nextUniverse.items || []);
        setSignals(nextSignals.items || []);
        if ((nextUniverse.items || []).length) {
          setSymbol(current => current && nextUniverse.items.some((item: MarketItem) => item.symbol === current)
            ? current : nextUniverse.items[0].symbol);
        }
      } catch {
        if (!stopped) {
          setStatus({ process: "offline", data_mode: "disconnected", broker_market_streams: 0 });
          setUniverse([]);
          setSignals([]);
        }
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { stopped = true; clearInterval(timer); };
  }, [refreshNonce]);

  useEffect(() => {
    if (!chartEl.current) return;
    let stopped = false;
    const chart = createChart(chartEl.current, {
      width: chartEl.current.clientWidth,
      height: 365,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#718096", fontSize: 11 },
      grid: { vertLines: { color: "#f0f3f8" }, horzLines: { color: "#f0f3f8" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e8edf4" },
      timeScale: { borderColor: "#e8edf4", timeVisible: true },
      handleScroll: true, handleScale: true,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#15966b", downColor: "#d95868", borderVisible: false,
      wickUpColor: "#15966b", wickDownColor: "#d95868",
    });
    let highLine: ReturnType<typeof candles.createPriceLine> | null = null;
    let lowLine: ReturnType<typeof candles.createPriceLine> | null = null;

    const refreshChart = async () => {
      if (!API || !symbol) {
        candles.setData([]);
        setChartBars(false);
        setChartMeta({source:"Backend not configured",updated:"Set NEXT_PUBLIC_WORKER_API_URL to enable broker data"});
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(API + "/api/market/" + encodeURIComponent(symbol) + "?timeframe=" + frame, { cache: "no-store" });
        if (!response.ok) throw new Error("No data");
        const data = await response.json();
        if (stopped) return;
        const bars: Bar[] = data.data_mode === "broker" && Array.isArray(data.bars) ? data.bars : [];
        candles.setData(bars.map(bar => ({...bar, time: bar.time as Time})));
        if (highLine) candles.removePriceLine(highLine);
        if (lowLine) candles.removePriceLine(lowLine);
        highLine = null; lowLine = null;
        if (bars.length) {
          const recent = bars.slice(-25);
          highLine = candles.createPriceLine({
            price: Math.max(...recent.map(bar => bar.high)), color: "#d69a36",
            lineWidth: 1, lineStyle: 2, title: "20-bar high candidate", axisLabelVisible: true,
          });
          lowLine = candles.createPriceLine({
            price: Math.min(...recent.map(bar => bar.low)), color: "#8873c7",
            lineWidth: 1, lineStyle: 2, title: "20-bar low candidate", axisLabelVisible: true,
          });
          chart.timeScale().fitContent();
        }
        setChartBars(bars.length > 0);
        setChartMeta({
          source: bars.length ? "Equiti MT5 broker candles" : "No broker data for this symbol/timeframe",
          updated: data.updated_at ? timeLabel(data.updated_at) : "Awaiting MT5 bridge",
          quoteAge: data.quote_age_seconds, bid: data.bid, ask: data.ask,
          spread: data.spread_points, digits: data.digits,
        });
      } catch {
        if (!stopped) {
          candles.setData([]);
          setChartBars(false);
          setChartMeta({source:"Broker feed unavailable",updated:"Check worker and MT5 connection"});
        }
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void refreshChart();
    const timer = setInterval(refreshChart, 15000);
    const resize = new ResizeObserver(entries => {
      if (entries[0]) chart.applyOptions({ width: entries[0].contentRect.width });
    });
    resize.observe(chartEl.current);
    return () => { stopped = true; clearInterval(timer); resize.disconnect(); chart.remove(); };
  }, [symbol, frame, refreshNonce]);

  const changeSection = (name: string) => setSection(name);
  const heading = section === "Overview" ? "Market overview" : section;
  const brokerLabel = feedConnected ? "Equiti broker feed connected" : workerOnline ? "Worker online · awaiting MT5" : API ? "Worker unavailable" : "Backend not configured";

  return (
    <main className="app">
      <aside className="side">
        <div className="brand"><i><Activity /></i><div><b>SwiftLabor<span>.ai</span></b><small>MARKET INTELLIGENCE</small></div></div>
        <label>WORKSPACE</label>
        <div className="desk"><b>Institutional desk</b><small>MT5-first market research</small></div>
        <label>ANALYZE</label>
        {NAV.slice(0,4).map(([name, Icon]) => (
          <button className={"nav " + (section === name ? "active" : "")} key={name} onClick={() => changeSection(name)}>
            <Icon size={16}/>{name}
          </button>
        ))}
        <label className="sys">INTELLIGENCE</label>
        {NAV.slice(4).map(([name, Icon]) => (
          <button className={"nav " + (section === name ? "active" : "")} key={name} onClick={() => changeSection(name)}>
            <Icon size={16}/>{name}{name === "AI analyst" && <em>RULES</em>}
          </button>
        ))}
        <div className="sidebottom">
          <div className="agent">
            <small><i className={feedConnected ? "green" : ""}/> DATA ENGINE</small>
            <b>{brokerLabel}</b>
            <p>{feedConnected ? streamCount + " live timeframe streams · read-only" : "No live quotes are invented or substituted."}</p>
          </div>
          <div className="profile">SL <span>Research workspace</span></div>
        </div>
      </aside>

      <section className="main">
        <header><span>Workspace <b>/ {section}</b></span>
          <div className={"status " + (feedConnected ? "live" : "demo")}><i/>{brokerLabel}</div>
          <div className="user">SL</div>
        </header>
        <div className="content">
          <div className="heading">
            <div><small>SWIFTLABOR INSTITUTIONAL INTELLIGENCE</small><h1>{heading}</h1>
              <p>Broker data first. Explainable structure analysis. No synthetic market quotes.</p></div>
            <button onClick={() => { setLoading(true); setRefreshNonce(value => value + 1); }}> <RefreshCw size={13}/> Refresh view</button>
          </div>

          <div className={"notice " + (feedConnected ? "notice-live" : "")}>
            {feedConnected ? <Radio size={17}/> : <AlertTriangle size={17}/>}
            <div><b>{feedConnected ? "Real Equiti MT5 data stream detected" : workerOnline ? "Analysis service is ready — MT5 not connected" : "Live data is not connected yet"}</b>
              <p>{feedConnected
                ? "Charts and signals below are sourced from the connected broker terminal. Confirm quote freshness before using any research."
                : "The dashboard intentionally shows no made-up prices or candles. Connect the client's MT5 terminal to populate live broker data."}</p>
            </div>
            <button onClick={() => changeSection("Settings")}>Connection setup <ChevronRight size={13}/></button>
          </div>

          <div className="stats">
            <Metric icon={<CandlestickChart/>} title="BROKER INSTRUMENTS" value={String(status?.broker_symbols || 0).padStart(2,"0")} note="Discovered from MT5 Market Watch"/>
            <Metric icon={<Radio/>} title="ACTIVE DATA STREAMS" value={String(streamCount).padStart(2,"0")} note="Symbol + timeframe feeds"/>
            <Metric icon={<Gauge/>} title="ANALYSIS CYCLE" value={workerOnline ? (status?.scan_interval_seconds || 15) + "s" : "—"} note="Worker scan interval"/>
            <Metric icon={<ShieldCheck/>} title="EXECUTION MODE" value="Read-only" note="No broker orders or account actions"/>
          </div>

          {section === "Settings" ? (
            <section className="panel setup">
              <small>CONNECTION STATUS</small><h2>Equiti MT5 bridge</h2>
              <p>Backend: {API || "NEXT_PUBLIC_WORKER_API_URL is not set"}</p>
              <p>Worker: {workerOnline ? "Online" : "Not reachable"} · MT5 streams: {streamCount}</p>
              <p>Broker server: {selected?.broker_server || "Will be identified from the connected MT5 terminal"}</p>
              <p>Bridge is read-only. MT5 login passwords are never required by SwiftLabor.</p>
              <ol><li>Deploy the worker and create a private bridge token in its environment.</li><li>Install the SwiftLaborBridge EA in the client's MT5 terminal.</li><li>Allow the worker HTTPS domain in MT5 WebRequest settings.</li><li>Attach the EA to charts using M15, H1 and H4 timeframe instances.</li></ol>
            </section>
          ) : section === "AI analyst" ? (
            <section className="panel setup">
              <small><BrainCircuit size={13}/> EXPLAINABLE MARKET ANALYSIS</small><h2>Rules engine status</h2>
              <p>{status?.engine || "Analysis worker is not reporting an active engine."}</p>
              <p>This build evaluates completed broker candles for a 20-bar sweep-and-reclaim candidate, directional displacement, short-term structure break, imbalance candidate, and spread relative to ATR.</p>
              <p>There is no generative AI commentary connection configured yet. The interface does not pretend a language model has reviewed the market. An AI commentary layer can be added once a secure model API is configured.</p>
              <p>Scores represent rule evidence weights, not win probabilities, certainty, or expected returns.</p>
            </section>
          ) : section === "Risk & journal" ? (
            <section className="panel setup"><small>RISK & JOURNAL</small><h2>Read-only research mode</h2>
              <p>Trade execution is disabled. This bridge does not import private account history, balances, open positions or credentials.</p>
              <p>Risk calculations and journaling should be enabled only after the client explicitly authorizes those additional account-data scopes.</p>
            </section>
          ) : (
            <>
              <div className="grid">
                <section className="panel chartpanel">
                  <div className="charthead"><div><small>SELECTED BROKER INSTRUMENT</small><h2>{symbol || "Awaiting MT5 symbol"} <em>{selected?.asset_class?.toUpperCase() || "MARKET"}</em></h2>
                    <p>{selected?.description || "Instrument and exact broker suffix will populate from MT5 Market Watch"}</p></div>
                    <div className="price"><small>{chartMeta.source.toUpperCase()}</small><b>{money(selected?.last_price, selected?.digits ?? 5)}</b></div>
                  </div>
                  <div className="toolbar">{FRAMES.map(f => <button className={frame === f ? "chosen" : ""} key={f} onClick={() => setFrame(f)}>{f}</button>)}
                    <span><Waves size={13}/> PRICE ACTION</span></div>
                  <div className="chartwrap"><div className="chart" ref={chartEl}/>{!chartBars && <div className="chartplaceholder"><Radio size={25}/><b>{loading ? "Checking broker feed…" : "Waiting for Equiti MT5 candles"}</b><p>Select an instrument from the live Market Watch list once the bridge is connected.</p></div>}</div>
                  <div className="chartfoot"><span><i className={chartBars ? "green" : ""}/>{chartMeta.source}</span><span>{chartMeta.updated}</span><span>Quote age: {ageLabel(chartMeta.quoteAge)}</span></div>
                  <div className="marketmeta"><span>Bid <b>{money(chartMeta.bid, chartMeta.digits ?? 5)}</b></span><span>Ask <b>{money(chartMeta.ask, chartMeta.digits ?? 5)}</b></span><span>Spread <b>{chartMeta.spread ?? "—"} pts</b></span><span>Last feed <b>{timeLabel(status?.last_feed_at)}</b></span></div>
                  <div className="credit">Chart engine: <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a></div>
                </section>

                <section className="panel analyst">
                  <small className="kicker"><BrainCircuit size={13}/> SWIFTLABOR MARKET ANALYST</small><h2>Setup assessment</h2>
                  <div className="agentstatus"><BrainCircuit/><div><b>{activeSignal ? activeSignal.side : "NO TRADE"}</b>
                    <small>{activeSignal ? symbol + " · " + frame + " · broker data" : "No validated broker-data setup"}</small></div></div>
                  <hr/><small className="kicker">LATEST ASSESSMENT</small>
                  <div className="assessment"><b>{activeSignal ? activeSignal.side : "STAND ASIDE"}</b>
                    <p>{activeSignal?.reason || "A research signal appears only after a fresh MT5 candle stream and the required price-action conditions are met."}</p></div>
                  <div className="row"><span><Waves size={14}/> Liquidity sweep candidate</span><b>{activeSignal?.evidence?.some(v => v.toLowerCase().includes("liquidity sweep")) ? "Detected" : "Not confirmed"}</b></div>
                  <div className="row"><span><Activity size={14}/> Displacement</span><b>{activeSignal?.evidence?.some(v => v.toLowerCase().includes("displacement")) ? "Detected" : "Not confirmed"}</b></div>
                  <div className="row"><span><Target size={14}/> Structure break</span><b>{activeSignal?.evidence?.some(v => v.toLowerCase().includes("structure break")) ? "Detected" : "Not confirmed"}</b></div>
                  <div className="row"><span><Gauge size={14}/> Evidence score</span><b>{activeSignal ? activeSignal.score + "/100" : "—"}</b></div>
                  <div className="note">Heuristic evidence score only — not a probability of profit. No entry orders are sent.</div>
                </section>
              </div>

              <div className="bottom">
                <section className="panel watch">
                  <div className="subhead"><div><small>LIVE MARKET WATCH</small><h2>Broker instruments</h2></div>
                    <div className="search"><Search size={13}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search symbols"/></div>
                  </div>
                  {filtered.length ? <table><thead><tr><th>INSTRUMENT</th><th>LAST</th><th>SPREAD</th><th>QUOTE AGE</th></tr></thead>
                    <tbody>{filtered.map(item => <tr key={item.symbol} onClick={() => setSymbol(item.symbol)} className={symbol === item.symbol ? "selected" : ""}>
                      <td><b>{item.symbol}</b><small>{item.description || item.asset_class}</small></td>
                      <td>{money(item.last_price, item.digits ?? 5)}</td><td>{item.spread_points ?? "—"} pts</td>
                      <td><i className={"tag " + (item.quote_fresh ? "fresh" : "")}>{ageLabel(item.quote_age_seconds)}</i></td>
                    </tr>)}</tbody></table> : <div className="empty"><Radio size={23}/><b>No MT5 instruments received</b><p>Once the client terminal sends its Market Watch snapshots, all available Equiti symbols will appear here, including suffixes.</p></div>}
                </section>
                <section className="panel signals">
                  <div className="subhead"><div><small>BROKER-DATA SETUPS</small><h2>Signal watch</h2></div><span>{signals.length} assessments</span></div>
                  {signals.length ? signals.slice(0,8).map(item => <div className="signal" key={item.symbol + item.timeframe} onClick={() => {setSymbol(item.symbol);setFrame(item.timeframe);}}>
                    <b>{item.symbol} · {item.timeframe}</b><span>{item.side} — {item.reason}</span><strong>{item.score}</strong>
                  </div>) : <div className="empty"><Target size={23}/><b>No broker signals yet</b><p>The engine will publish only when live completed candles support a qualifying setup.</p></div>}
                  <div className="note">A signal is a research watch, not an instruction to place a trade.</div>
                </section>
              </div>
              {section === "Liquidity map" && <section className="panel setup extra"><small>LIQUIDITY MAP · {symbol}</small><h2>Observable price extremes</h2><p>The chart plots recent 25-bar highs/lows as broker-candle reference levels. These are not global liquidity pools, dealer books, hidden orders, or guaranteed stop clusters.</p></section>}
              {section === "Signal center" && <section className="panel setup extra"><small>SIGNAL CENTER</small><h2>Rule-based broker assessments</h2><p>Only fresh broker streams are eligible. Signals expire when their feed becomes stale.</p></section>}
            </>
          )}
          <footer>© 2026 SwiftLabor.ai · Equiti MT5 bridge · Research-only mode · No trade execution</footer>
        </div>
      </section>
    </main>
  );
}

function Metric({icon,title,value,note}:{icon:ReactNode;title:string;value:string;note:string}) {
  return <div className="metric"><div><small>{title}</small><i>{icon}</i></div><b>{value}</b><span>{note}</span></div>;
}
