// SwiftLabor.ai read-only market data bridge. No order functions.
#property strict
#property version "0.2.0"
input string InpWorkerUrl="https://YOUR-WORKER-DOMAIN";
input string InpBridgeToken="REPLACE_WITH_PRIVATE_TOKEN";
input string InpSymbols="EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD,EURJPY";
input ENUM_TIMEFRAMES InpTimeframe=PERIOD_M15;
input int InpBars=160;
input int InpTimerSeconds=15;
input int InpTimeoutMs=8000;
string TfName(ENUM_TIMEFRAMES tf){switch(tf){case PERIOD_M1:return "M1";case PERIOD_M5:return "M5";case PERIOD_M15:return "M15";case PERIOD_M30:return "M30";case PERIOD_H1:return "H1";case PERIOD_H4:return "H4";case PERIOD_D1:return "D1";}return "M15";}
string Payload(string symbol){MqlRates r[];ArraySetAsSeries(r,true);int n=CopyRates(symbol,InpTimeframe,0,InpBars,r);if(n<35)return "";int d=(int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);string b="{\"symbol\":\""+symbol+"\",\"timeframe\":\""+TfName(InpTimeframe)+"\",\"bars\":[";for(int i=n-1;i>=0;i--){if(i!=n-1)b+=",";b+="{\"time\":"+IntegerToString((long)r[i].time)+",\"open\":"+DoubleToString(r[i].open,d)+",\"high\":"+DoubleToString(r[i].high,d)+",\"low\":"+DoubleToString(r[i].low,d)+",\"close\":"+DoubleToString(r[i].close,d)+",\"tick_volume\":"+DoubleToString((double)r[i].tick_volume,0)+"}";}return b+"]}";}
void SendSymbol(string symbol){StringTrimLeft(symbol);StringTrimRight(symbol);if(symbol==""||!SymbolSelect(symbol,true))return;string p=Payload(symbol);if(p=="")return;char data[];StringToCharArray(p,data,0,WHOLE_ARRAY,CP_UTF8);if(ArraySize(data)>0)ArrayResize(data,ArraySize(data)-1);char result[];string rh;string h="Content-Type: application/json\r\nX-Bridge-Token: "+InpBridgeToken+"\r\n";int code=WebRequest("POST",InpWorkerUrl+"/ingest/mt5",h,InpTimeoutMs,data,result,rh);if(code<200||code>=300)Print("SwiftLabor bridge HTTP ",code," for ",symbol,": ",CharArrayToString(result));}
int OnInit(){if(InpWorkerUrl==""||InpBridgeToken=="REPLACE_WITH_PRIVATE_TOKEN")return INIT_PARAMETERS_INCORRECT;EventSetTimer(MathMax(5,InpTimerSeconds));Print("SwiftLabor read-only bridge started; no orders are sent.");return INIT_SUCCEEDED;}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){string s[];int n=StringSplit(InpSymbols,',',s);for(int i=0;i<n;i++)SendSymbol(s[i]);}
