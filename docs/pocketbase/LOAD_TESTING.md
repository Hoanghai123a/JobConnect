# Load Testing - Nông Trại Game

## Tổng quan

Load testing để verify performance của server-side APIs với concurrent users và high request volume.

**Target:** PocketBase backend với farm transaction APIs  
**Test Date:** 2026-10-01  
**Tools:** Apache Bench (ab), k6, Artillery

---

## Test Environment

### Prerequisites

```bash
# 1. PocketBase running
./pocketbase serve

# 2. Server hooks deployed
ls pb_hooks/farm_transactions.pb.js

# 3. Test accounts (100 users)
# Script to create test users: scripts/create-test-users.sh
```

### Hardware Specs

- **CPU:** _________
- **RAM:** _________
- **Disk:** _________
- **Network:** _________

---

## Test Suite 1: Baseline Performance

### LT-BASE-001: Single Request Latency

**Objective:** Measure baseline latency cho mỗi endpoint

```bash
# Test buy-seed endpoint
time curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot"}'

# Repeat 10 times và calculate average
```

**Acceptance Criteria:**
- p50 latency < 50ms
- p95 latency < 150ms
- p99 latency < 300ms

**Results:**

| Endpoint | p50 | p95 | p99 | Pass/Fail |
|----------|-----|-----|-----|-----------|
| buy-seed | ___ | ___ | ___ | _____ |
| plant-crop | ___ | ___ | ___ | _____ |
| harvest-crop | ___ | ___ | ___ | _____ |
| sell-crop | ___ | ___ | ___ | _____ |

---

### LT-BASE-002: Throughput (Transactions Per Second)

**Objective:** Maximum TPS server có thể handle

```bash
# Apache Bench: 1000 requests, 10 concurrent
ab -n 1000 -c 10 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -p buy-seed-payload.json \
  http://localhost:8090/api/farm/buy-seed

# Check results
# Requests per second:    XXX [#/sec] (mean)
```

**Acceptance Criteria:**
- TPS >= 100 requests/second
- No failed requests
- Response time mean < 100ms

**Results:**
- Requests per second: _______
- Failed requests: _______
- Response time mean: _______
- Pass: ✅ | Fail: ❌

---

## Test Suite 2: Concurrent Users

### LT-CONC-001: 10 Concurrent Users

**Objective:** Simulate 10 players simultaneously

**Scenario:** Full gameplay loop (buy → plant → wait → harvest → sell)

```bash
# k6 script
k6 run --vus 10 --duration 60s load-test-gameplay.js
```

**k6 Script:** [load-test-gameplay.js](#k6-script-gameplay-loop)

**Acceptance Criteria:**
- 95% requests succeed
- p95 latency < 300ms
- No server errors

**Results:**
- Success rate: _____%
- p95 latency: _____ms
- Errors: _____
- Pass: ✅ | Fail: ❌

---

### LT-CONC-002: 50 Concurrent Users

**Objective:** Moderate load

```bash
k6 run --vus 50 --duration 120s load-test-gameplay.js
```

**Acceptance Criteria:**
- 90% requests succeed
- p95 latency < 500ms
- Server stays responsive

**Results:**
- Success rate: _____%
- p95 latency: _____ms
- Server CPU: _____%
- Server RAM: _____%
- Pass: ✅ | Fail: ❌

---

### LT-CONC-003: 100 Concurrent Users

**Objective:** High load (target capacity)

```bash
k6 run --vus 100 --duration 180s load-test-gameplay.js
```

**Acceptance Criteria:**
- 85% requests succeed
- p95 latency < 1000ms
- No crashes
- CPU < 80%
- Memory < 2GB

**Results:**
- Success rate: _____%
- p95 latency: _____ms
- Server CPU: _____%
- Server RAM: _____MB
- Crashed: Yes ❌ | No ✅

---

### LT-CONC-004: 200 Concurrent Users (Stress Test)

**Objective:** Beyond expected capacity

```bash
k6 run --vus 200 --duration 300s load-test-gameplay.js
```

**Expected:** Graceful degradation, not crash

**Results:**
- Success rate: _____%
- p95 latency: _____ms
- Server behavior: _____________________

---

## Test Suite 3: Spike Testing

### LT-SPIKE-001: Sudden Traffic Spike

**Objective:** 0 → 100 users in 10 seconds

**k6 Stages:**
```javascript
export let options = {
  stages: [
    { duration: '10s', target: 100 },  // Ramp up
    { duration: '60s', target: 100 },  // Hold
    { duration: '10s', target: 0 }     // Ramp down
  ]
};
```

**Acceptance Criteria:**
- Server handles spike without crash
- Recovery time < 30s after spike ends

**Results:**
- Peak latency: _____ms
- Errors during spike: _____
- Recovery time: _____s
- Pass: ✅ | Fail: ❌

---

## Test Suite 4: Sustained Load

### LT-SUST-001: 1 Hour Sustained Load

**Objective:** 50 concurrent users for 1 hour

```bash
k6 run --vus 50 --duration 3600s load-test-gameplay.js
```

**Monitoring:**
- CPU usage over time
- Memory usage (check for leaks)
- Disk I/O
- Response times (check for degradation)

**Acceptance Criteria:**
- No memory leaks (stable memory usage)
- No performance degradation over time
- 90% requests succeed throughout

**Results:**
- Initial memory: _____MB
- Final memory: _____MB
- Memory leak: Yes ❌ | No ✅
- Performance degradation: Yes ❌ | No ✅

---

## Test Suite 5: Database Performance

### LT-DB-001: Read Performance

**Objective:** Measure database read latency under load

```bash
# Simulate 100 users reading player data
k6 run --vus 100 --duration 60s load-test-reads.js
```

**Queries:**
- farm_players (get player)
- farm_plots (list plots)
- farm_inventory (list inventory)
- farm_quests (list quests)

**Acceptance Criteria:**
- Reads < 20ms at 90th percentile
- No timeout errors

**Results:**
- farm_players read: _____ms
- farm_plots read: _____ms
- farm_inventory read: _____ms
- farm_quests read: _____ms
- Pass: ✅ | Fail: ❌

---

### LT-DB-002: Write Performance

**Objective:** Measure database write latency under load

```bash
# Simulate 50 users performing transactions
k6 run --vus 50 --duration 60s load-test-writes.js
```

**Acceptance Criteria:**
- Writes < 50ms at 90th percentile
- No deadlocks
- No transaction conflicts

**Results:**
- Average write latency: _____ms
- Deadlocks: _____
- Conflicts: _____
- Pass: ✅ | Fail: ❌

---

## Test Suite 6: API-Specific Tests

### LT-API-001: Buy Seed Throughput

**Objective:** Max TPS for buy-seed endpoint

```bash
ab -n 10000 -c 50 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -p buy-seed.json \
  http://localhost:8090/api/farm/buy-seed
```

**Results:**
- TPS: _____
- Failed: _____
- Pass: ✅ | Fail: ❌

---

### LT-API-002: Harvest Crop Throughput

**Objective:** Max TPS for harvest-crop endpoint

```bash
ab -n 5000 -c 30 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -p harvest.json \
  http://localhost:8090/api/farm/harvest-crop
```

**Results:**
- TPS: _____
- Failed: _____
- Pass: ✅ | Fail: ❌

---

## k6 Scripts

### k6 Script: Gameplay Loop

```javascript
// load-test-gameplay.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:8090';
const TOKEN = __ENV.TOKEN || 'YOUR_AUTH_TOKEN';

export let options = {
  vus: 10,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05']
  }
};

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': TOKEN
  };

  // 1. Buy seed
  let buyRes = http.post(
    `${BASE_URL}/api/farm/buy-seed`,
    JSON.stringify({ cropId: 'carrot' }),
    { headers }
  );
  check(buyRes, {
    'buy seed success': (r) => r.status === 200,
    'buy seed latency': (r) => r.timings.duration < 200
  });
  sleep(1);

  // 2. Plant crop
  let plantRes = http.post(
    `${BASE_URL}/api/farm/plant-crop`,
    JSON.stringify({ plotId: 0, cropId: 'carrot' }),
    { headers }
  );
  check(plantRes, {
    'plant crop success': (r) => r.status === 200
  });
  sleep(1);

  // 3. Wait for grow (carrot = 30s, but we'll just wait 5s for load test)
  sleep(5);

  // 4. Try to harvest (will fail if not ready, that's ok)
  let harvestRes = http.post(
    `${BASE_URL}/api/farm/harvest-crop`,
    JSON.stringify({ plotId: 0 }),
    { headers }
  );
  check(harvestRes, {
    'harvest response': (r) => r.status === 200 || r.status === 400
  });
  sleep(1);

  // 5. Sell crop (if harvest succeeded)
  if (harvestRes.status === 200) {
    let sellRes = http.post(
      `${BASE_URL}/api/farm/sell-crop`,
      JSON.stringify({ cropId: 'carrot', quantity: 1 }),
      { headers }
    );
    check(sellRes, {
      'sell crop success': (r) => r.status === 200
    });
  }

  sleep(2);
}
```

### k6 Script: Read-Only Load

```javascript
// load-test-reads.js
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://localhost:8090';
const TOKEN = __ENV.TOKEN || 'YOUR_AUTH_TOKEN';

export let options = {
  vus: 100,
  duration: '60s'
};

export default function () {
  const headers = {
    'Authorization': TOKEN
  };

  // Read player
  http.get(`${BASE_URL}/api/collections/farm_players/records`, { headers });
  
  // Read plots
  http.get(`${BASE_URL}/api/collections/farm_plots/records`, { headers });
  
  // Read inventory
  http.get(`${BASE_URL}/api/collections/farm_inventory/records`, { headers });
  
  // Read quests
  http.get(`${BASE_URL}/api/collections/farm_quests/records`, { headers });
}
```

---

## Artillery Script (Alternative)

```yaml
# artillery-config.yml
config:
  target: "http://localhost:8090"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Spike"
  variables:
    token: "YOUR_AUTH_TOKEN"

scenarios:
  - name: "Farm gameplay"
    flow:
      - post:
          url: "/api/farm/buy-seed"
          json:
            cropId: "carrot"
          headers:
            Authorization: "{{ token }}"
      - think: 1
      - post:
          url: "/api/farm/plant-crop"
          json:
            plotId: 0
            cropId: "carrot"
          headers:
            Authorization: "{{ token }}"
      - think: 30
      - post:
          url: "/api/farm/harvest-crop"
          json:
            plotId: 0
          headers:
            Authorization: "{{ token }}"
```

**Run Artillery:**
```bash
artillery run artillery-config.yml
```

---

## Monitoring During Tests

### System Metrics

```bash
# Monitor CPU, RAM, Disk I/O during load test
while true; do
  echo "=== $(date) ==="
  top -b -n 1 | head -20
  free -h
  iostat -x 1 1
  sleep 5
done > monitoring.log
```

### PocketBase Metrics

```bash
# Monitor PocketBase logs
tail -f pb_data/logs/*.log | grep -E "(ERROR|WARN|slow)"
```

### Database Metrics

```bash
# SQLite database size
du -h pb_data/data.db

# Query slow queries (if enabled)
tail -f pb_data/logs/queries.log | grep "duration > 100ms"
```

---

## Load Test Results Summary

### Performance Metrics

| Test | Target | Actual | Pass/Fail |
|------|--------|--------|-----------|
| Single request latency (p95) | < 150ms | ___ms | ___ |
| Throughput (TPS) | >= 100 | ___ | ___ |
| 10 concurrent users | 95% success | ___% | ___ |
| 50 concurrent users | 90% success | ___% | ___ |
| 100 concurrent users | 85% success | ___% | ___ |
| 1 hour sustained | No leaks | ___ | ___ |

### Bottlenecks Identified

1. **Bottleneck:** __________________
   - **Metric:** __________________
   - **Remediation:** __________________

2. **Bottleneck:** __________________
   - **Metric:** __________________
   - **Remediation:** __________________

---

## Optimization Recommendations

### Database Optimizations

1. **Indexes:**
   ```sql
   CREATE INDEX idx_farm_plots_player ON farm_plots (player);
   CREATE INDEX idx_farm_inventory_player ON farm_inventory (player);
   CREATE INDEX idx_farm_quests_player ON farm_quests (player);
   CREATE INDEX idx_farm_transactions_created ON farm_transactions (created);
   ```

2. **Query Optimization:**
   - Use prepared statements
   - Batch reads where possible
   - Cache player data (5-minute TTL)

3. **Connection Pooling:**
   - PocketBase handles this automatically
   - Monitor connection count under load

### Server Optimizations

1. **Rate Limiting:** Prevent abuse (implemented in UPDATED_SECURITY_RULES.md)

2. **Response Caching:**
   - Cache crop configs (static data)
   - Cache player data with short TTL

3. **Horizontal Scaling:**
   - Run multiple PocketBase instances
   - Load balancer (nginx) in front
   - Shared SQLite or migrate to PostgreSQL

### Client Optimizations

1. **Debouncing:** Prevent rapid-fire clicks

2. **Optimistic UI:** Update UI immediately, sync with server in background

3. **Request Batching:** Batch multiple operations into one API call

---

## Production Readiness Checklist

- [ ] All load tests pass acceptance criteria
- [ ] No memory leaks detected
- [ ] Server handles 100 concurrent users
- [ ] p95 latency < 500ms under load
- [ ] Database indexes created
- [ ] Rate limiting enabled
- [ ] Monitoring alerts configured
- [ ] Auto-scaling rules defined (if cloud deployment)

---

## Tools Installation

### Apache Bench

```bash
# Ubuntu/Debian
sudo apt-get install apache2-utils

# macOS
brew install httpd
```

### k6

```bash
# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# macOS
brew install k6

# Windows
choco install k6
```

### Artillery

```bash
npm install -g artillery
```

---

## References

- [k6 Documentation](https://k6.io/docs/)
- [Apache Bench Guide](https://httpd.apache.org/docs/2.4/programs/ab.html)
- [Artillery Documentation](https://www.artillery.io/docs)
- [PocketBase Performance Tips](https://pocketbase.io/docs/going-to-production/)
