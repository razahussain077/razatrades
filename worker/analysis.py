"""Explainable price-action pattern detection. Scores are heuristic, not probabilities."""
from statistics import median
from typing import Any

def _atr(bars: list[dict[str, Any]], period: int = 14) -> float:
    if len(bars) < period + 1:
        return 0.0
    ranges = []
    for i in range(len(bars) - period, len(bars)):
        b, prev = bars[i], float(bars[i-1]["close"])
        ranges.append(max(float(b["high"])-float(b["low"]), abs(float(b["high"])-prev), abs(float(b["low"])-prev)))
    return sum(ranges) / len(ranges)

def analyze_market(bars: list[dict[str, Any]], symbol: str, timeframe: str) -> dict[str, Any]:
    result = {"symbol":symbol,"timeframe":timeframe,"side":"NO TRADE","score":0,"reason":"No validated multi-factor setup is present.","evidence":[],"invalidation":None,"engine":"swiftlabor-rules-v0.2"}
    if len(bars) < 35:
        result["reason"] = "Insufficient completed candles; at least 35 are required."
        return result
    last, prior = bars[-1], bars[-21:-1]
    close, high, low, open_ = map(float, (last["close"],last["high"],last["low"],last["open"]))
    prior_high = max(float(b["high"]) for b in prior)
    prior_low = min(float(b["low"]) for b in prior)
    atr = _atr(bars)
    body = abs(close-open_)
    recent = [abs(float(b["close"])-float(b["open"])) for b in bars[-12:-1]]
    median_body = median(recent) if recent else 0.0
    displacement = atr > 0 and body >= max(atr*.65, median_body*1.5)
    bullish_sweep = low < prior_low and close > prior_low
    bearish_sweep = high > prior_high and close < prior_high
    micro = bars[-9:-1]
    micro_high = max(float(b["high"]) for b in micro)
    micro_low = min(float(b["low"]) for b in micro)
    bullish_structure, bearish_structure = close > micro_high, close < micro_low
    bullish_fvg = low > float(bars[-3]["high"])
    bearish_fvg = high < float(bars[-3]["low"])
    if bullish_sweep == bearish_sweep:
        result["reason"] = "No unambiguous 20-bar sweep-and-reclaim event on the evaluated candle."
        result["evidence"] = ["No qualifying buy-side or sell-side sweep candidate."]
        return result
    direction = "BUY" if bullish_sweep else "SELL"
    evidence = [("Sell-side" if bullish_sweep else "Buy-side") + " liquidity sweep candidate: price crossed the prior 20-bar extreme and closed back inside."]
    score = 35
    if displacement and ((direction == "BUY" and close > open_) or (direction == "SELL" and close < open_)):
        evidence.append("Same-direction displacement: candle body expanded relative to ATR and recent candle bodies.")
        score += 25
    else:
        displacement = False
    structure = bullish_structure if direction == "BUY" else bearish_structure
    if structure:
        evidence.append("Short-term structure break: close exceeded the prior micro-range boundary.")
        score += 25
    if (bullish_fvg if direction == "BUY" else bearish_fvg):
        evidence.append("Three-candle imbalance candidate detected.")
        score += 15
    result.update({"score":score,"evidence":evidence,"invalidation":low if direction=="BUY" else high})
    if not displacement or not structure:
        result["reason"] = "Sweep candidate found, but displacement and structure confirmation are not both present. Stand aside."
        return result
    result.update({"side":f"WATCH {direction}","reason":"Sweep, same-direction displacement and short-term structure break align. Research watch only; wait for a separate retest/trigger rule."})
    return result
