import unittest
from fastapi.testclient import TestClient
import main

def bars(n=50):
    return [{"time":1700000000+i*900,"open":1.08,"high":1.0802,"low":1.0798,"close":1.08001,"tick_volume":10} for i in range(n)]

class ApiTests(unittest.TestCase):
    def setUp(self):
        main.BRIDGE_TOKEN="unit-test-token"
        main.MARKET.clear()
        main.SIGNALS.clear()

    def test_token_required(self):
        with TestClient(main.app) as client:
            response=client.post("/ingest/mt5",json={"symbol":"EURUSD","timeframe":"M15","bars":bars()})
            self.assertEqual(response.status_code,401)

    def test_valid_read_only_ingestion_and_universe(self):
        payload={"symbol":"EURUSD.a","timeframe":"M15","asset_class":"forex","description":"Euro vs US Dollar",
                 "broker_server":"Equiti-Demo","quote_time":1700000000,"bid":1.08,"ask":1.0801,
                 "digits":5,"point":0.00001,"spread_points":10,"bars":bars()}
        with TestClient(main.app) as client:
            response=client.post("/ingest/mt5",headers={"X-Bridge-Token":"unit-test-token"},json=payload)
            self.assertEqual(response.status_code,200)
            market=client.get("/api/market/EURUSD.a?timeframe=M15").json()
            self.assertEqual(market["data_mode"],"broker")
            self.assertEqual(market["broker_server"],"Equiti-Demo")
            universe=client.get("/api/universe").json()
            self.assertEqual(universe["items"][0]["symbol"],"EURUSD.a")

    def test_out_of_order_candles_rejected(self):
        data=bars()
        data[-1]["time"]=data[-2]["time"]-1
        with TestClient(main.app) as client:
            response=client.post("/ingest/mt5",headers={"X-Bridge-Token":"unit-test-token"},
                                 json={"symbol":"EURUSD","timeframe":"M15","bars":data})
            self.assertEqual(response.status_code,422)

if __name__ == "__main__":
    unittest.main()
