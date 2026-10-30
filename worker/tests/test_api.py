import unittest
from fastapi.testclient import TestClient
import main

def bars(n=50):
    return [{"time":1700000000+i*900,"open":1.08,"high":1.0802,"low":1.0798,"close":1.08001,"tick_volume":10} for i in range(n)]

class ApiTests(unittest.TestCase):
    def setUp(self):
        main.BRIDGE_TOKEN="unit-test-token"
        main.MARKET.clear(); main.SIGNALS.clear()
    def test_token_required(self):
        with TestClient(main.app) as c:
            self.assertEqual(c.post("/ingest/mt5",json={"symbol":"EURUSD","timeframe":"M15","bars":bars()}).status_code,401)
    def test_valid_read_only_ingestion(self):
        with TestClient(main.app) as c:
            r=c.post("/ingest/mt5",headers={"X-Bridge-Token":"unit-test-token"},json={"symbol":"EURUSD.a","timeframe":"M15","bars":bars()})
            self.assertEqual(r.status_code,200)
            self.assertEqual(c.get("/api/market/EURUSD.a?timeframe=M15").json()["data_mode"],"broker")
    def test_out_of_order_candles_rejected(self):
        data=bars(); data[-1]["time"]=data[-2]["time"]-1
        with TestClient(main.app) as c:
            r=c.post("/ingest/mt5",headers={"X-Bridge-Token":"unit-test-token"},json={"symbol":"EURUSD","timeframe":"M15","bars":data})
            self.assertEqual(r.status_code,422)

if __name__ == "__main__": unittest.main()
