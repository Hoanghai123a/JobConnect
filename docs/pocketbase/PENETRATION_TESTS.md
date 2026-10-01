# Penetration Testing Suite - Nông Trại Game

## Tổng quan

Suite này test security của authenticated mode với server-side validation. Test các exploit scenarios đã identify trong SECURITY_AUDIT.md.

**Target:** PocketBase backend với server-side transaction APIs  
**Test Date:** 2026-10-01  
**Tester:** Security QA Team

---

## Test Environment Setup

### Prerequisites

```bash
# 1. PocketBase running với updated rules
./pocketbase serve

# 2. Server hooks deployed
ls pb_hooks/farm_transactions.pb.js

# 3. Test user account
# Email: pentest@example.com
# Password: Test123456!
```

### Tools Required

- **curl** - API testing
- **jq** - JSON parsing
- **Chrome DevTools** - Client manipulation attempts
- **Burp Suite** (optional) - Request interception

---

## Test Suite 1: Authentication & Authorization

### PT-AUTH-001: Unauthenticated Access

**Objective:** Verify endpoints require authentication

```bash
# Test: Access API without token
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -d '{"cropId":"carrot"}'

# Expected: 400 Unauthorized
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-AUTH-002: Token Hijacking

**Objective:** Verify tokens are validated

```bash
# Test: Use fake/expired token
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer FAKE_TOKEN_12345" \
  -d '{"cropId":"carrot"}'

# Expected: 400 Unauthorized
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-AUTH-003: Cross-User Access

**Objective:** User A cannot manipulate User B's data

```bash
# Setup: Login as User A, get token
USER_A_TOKEN="<token_a>"

# Test: Try to harvest User B's plot
curl -X POST http://localhost:8090/api/farm/harvest-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -d '{"plotId":0}'  # User B's plot ID

# Expected: 404 or 400 (plot not found for User A)
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

## Test Suite 2: Input Validation

### PT-INPUT-001: Negative Quantity

**Objective:** Prevent negative quantity exploit

```bash
# Test: Buy seed with negative cost
curl -X POST http://localhost:8090/api/farm/sell-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot","quantity":-10}'

# Expected: 400 "Số lượng không hợp lệ"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-INPUT-002: SQL Injection

**Objective:** Verify input sanitization

```bash
# Test: SQL injection in cropId
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot\"; DROP TABLE farm_players; --"}'

# Expected: 400 "Crop không tồn tại"
# Database intact: ✅ | Database damaged: ❌
```

**Result:** _____________

---

### PT-INPUT-003: Integer Overflow

**Objective:** Prevent overflow attacks

```bash
# Test: Buy seed with huge quantity
curl -X POST http://localhost:8090/api/farm/sell-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot","quantity":999999999999999}'

# Expected: 400 or capped at max safe integer
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-INPUT-004: Invalid Crop ID

**Objective:** Reject invalid crop references

```bash
# Test: Buy non-existent crop
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"HACKED_CROP_999"}'

# Expected: 400 "Crop không tồn tại"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

## Test Suite 3: Business Logic Exploits

### PT-LOGIC-001: Insufficient Funds Bypass

**Objective:** Cannot buy without enough coins

```bash
# Setup: New account with 100 coins
# Test: Try to buy expensive seed (golden_ginger = 1500 coins)
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"golden_ginger"}'

# Expected: 400 "Không đủ xu"
# Coins deducted: ❌ | Coins unchanged: ✅
```

**Result:** _____________

---

### PT-LOGIC-002: Instant Harvest (Timestamp Manipulation)

**Objective:** Cannot harvest before crop is ready

**Client-side attempt:**
```javascript
// In browser console
// Try to manipulate harvestAt in PocketBase directly
await pb.collection('farm_plots').update(plotId, {
  harvest_at: new Date().toISOString()  // Set to now
});
```

**Expected:** Update rejected (updateRule = null)

**Server API attempt:**
```bash
# Plant crop
curl -X POST http://localhost:8090/api/farm/plant-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0,"cropId":"carrot"}'

# Immediately try to harvest (carrot needs 30 seconds)
curl -X POST http://localhost:8090/api/farm/harvest-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0}'

# Expected: 400 "Cây chưa lớn" with timeRemaining
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-LOGIC-003: Double Harvest

**Objective:** Cannot harvest same plot twice

```bash
# Setup: Plant and wait for ready
# Harvest once
curl -X POST http://localhost:8090/api/farm/harvest-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0}'

# Try to harvest again immediately
curl -X POST http://localhost:8090/api/farm/harvest-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0}'

# Expected: 400 "Ô đất trống"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-LOGIC-004: Plant Without Seeds

**Objective:** Cannot plant without inventory

```bash
# Setup: Ensure inventory is empty for carrot
# Test: Try to plant
curl -X POST http://localhost:8090/api/farm/plant-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0,"cropId":"carrot"}'

# Expected: 400 "Không có hạt giống trong kho"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-LOGIC-005: Sell More Than Inventory

**Objective:** Cannot sell crops not owned

```bash
# Setup: Player has 2 carrots in inventory
# Test: Try to sell 10 carrots
curl -X POST http://localhost:8090/api/farm/sell-crop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot","quantity":10}'

# Expected: 400 "Không đủ số lượng trong kho"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

## Test Suite 4: Race Conditions

### PT-RACE-001: Concurrent Buy Requests

**Objective:** Prevent double-spending via race condition

```bash
# Setup: Player has 100 coins, carrot costs 20
# Test: Send 10 concurrent buy requests

for i in {1..10}; do
  curl -X POST http://localhost:8090/api/farm/buy-seed \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"cropId":"carrot"}' &
done
wait

# Expected: 5 succeed, 5 fail (100 / 20 = 5 max purchases)
# Actual success count: _____
# Coins remaining should be 0 or 20 (not negative)
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-RACE-002: Concurrent Harvest

**Objective:** Prevent double harvest via race condition

```bash
# Setup: Plot 0 is ready to harvest
# Test: Send 5 concurrent harvest requests

for i in {1..5}; do
  curl -X POST http://localhost:8090/api/farm/harvest-crop \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"plotId":0}' &
done
wait

# Expected: 1 succeed, 4 fail
# Actual success count: _____
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

## Test Suite 5: Client-Side Manipulation

### PT-CLIENT-001: Direct PocketBase Update (Coins)

**Objective:** Client cannot update coins directly

```javascript
// In browser DevTools console
const playerId = "<player_id>";

// Attempt 1: Update coins via PocketBase SDK
try {
  await pb.collection('farm_players').update(playerId, {
    coins: 999999
  });
  console.log("❌ FAIL: Coins updated!");
} catch (e) {
  console.log("✅ PASS: Update rejected -", e.message);
}
```

**Expected:** Update rejected (updateRule = null)  
**Result:** _____________

---

### PT-CLIENT-002: Direct PocketBase Update (Inventory)

**Objective:** Client cannot create unlimited items

```javascript
// Attempt: Create inventory with 999 items
try {
  await pb.collection('farm_inventory').create({
    player: playerId,
    crop_id: "golden_ginger",
    quantity: 999
  });
  console.log("❌ FAIL: Inventory created!");
} catch (e) {
  console.log("✅ PASS: Create rejected -", e.message);
}
```

**Expected:** Create rejected (createRule requires quantity = 0)  
**Result:** _____________

---

### PT-CLIENT-003: Direct PocketBase Update (Quest Progress)

**Objective:** Client cannot manipulate quest progress

```javascript
// Attempt: Set quest progress to 100
try {
  await pb.collection('farm_quests').update(questId, {
    progress: 100,
    claimed: true
  });
  console.log("❌ FAIL: Quest updated!");
} catch (e) {
  console.log("✅ PASS: Update rejected -", e.message);
}
```

**Expected:** Update rejected (updateRule = null)  
**Result:** _____________

---

## Test Suite 6: Transaction Atomicity

### PT-ATOMIC-001: Buy Seed Rollback

**Objective:** If inventory add fails, coins are not deducted

**Simulation:** Disconnect network mid-request

```bash
# Start buy request
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot"}' &

# Kill request after 100ms
sleep 0.1 && killall curl

# Check coins and inventory
# Expected: Either both succeed or both fail (atomic)
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-ATOMIC-002: Harvest Rollback

**Objective:** If reward fails, plot is not cleared

**Test:** Manually test by stopping PocketBase mid-transaction

**Result:** _____________

---

## Test Suite 7: Rate Limiting

### PT-RATE-001: Burst Requests

**Objective:** Rate limit prevents abuse

```bash
# Test: Send 100 requests in 1 second
for i in {1..100}; do
  curl -X POST http://localhost:8090/api/farm/buy-seed \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"cropId":"carrot"}' &
done
wait

# Expected: Some requests return 429 "Too many requests"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

## Test Suite 8: Transaction Logging

### PT-LOG-001: Audit Trail

**Objective:** All transactions are logged

```bash
# Perform transaction
curl -X POST http://localhost:8090/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot"}'

# Check transaction log
curl "http://localhost:8090/api/collections/farm_transactions/records?filter=player='$PLAYER_ID'" \
  -H "Authorization: Bearer $TOKEN"

# Expected: Transaction exists với type="BUY_SEED"
# Pass: ✅ | Fail: ❌
```

**Result:** _____________

---

### PT-LOG-002: Tamper Protection

**Objective:** Transaction logs cannot be modified

```javascript
// Attempt to delete transaction log
try {
  await pb.collection('farm_transactions').delete(transactionId);
  console.log("❌ FAIL: Log deleted!");
} catch (e) {
  console.log("✅ PASS: Delete rejected -", e.message);
}
```

**Expected:** Delete rejected (deleteRule = null)  
**Result:** _____________

---

## Test Results Summary

### Vulnerability Scan

| Test Suite | Total | Pass | Fail | Critical |
|------------|-------|------|------|----------|
| Authentication | 3 | ___ | ___ | ___ |
| Input Validation | 4 | ___ | ___ | ___ |
| Business Logic | 5 | ___ | ___ | ___ |
| Race Conditions | 2 | ___ | ___ | ___ |
| Client Manipulation | 3 | ___ | ___ | ___ |
| Atomicity | 2 | ___ | ___ | ___ |
| Rate Limiting | 1 | ___ | ___ | ___ |
| Transaction Logging | 2 | ___ | ___ | ___ |
| **TOTAL** | **22** | ___ | ___ | ___ |

### Critical Findings

1. **Finding ID:** PT-XXXX-XXX
   - **Severity:** Critical / High / Medium / Low
   - **Description:**
   - **Exploit Steps:**
   - **Impact:**
   - **Remediation:**

---

## Automated Testing Script

```bash
#!/bin/bash
# run-pentest.sh

BASE_URL="http://localhost:8090"
TOKEN="<your_token>"

echo "=== Farm Game Penetration Testing ==="
echo ""

# Test 1: Unauthenticated access
echo "[PT-AUTH-001] Testing unauthenticated access..."
RESULT=$(curl -s -X POST "$BASE_URL/api/farm/buy-seed" \
  -H "Content-Type: application/json" \
  -d '{"cropId":"carrot"}')

if echo "$RESULT" | grep -q "Unauthorized"; then
  echo "✅ PASS: Unauthenticated access blocked"
else
  echo "❌ FAIL: Unauthenticated access allowed!"
fi

# Test 2: Negative quantity
echo "[PT-INPUT-001] Testing negative quantity..."
RESULT=$(curl -s -X POST "$BASE_URL/api/farm/sell-crop" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot","quantity":-10}')

if echo "$RESULT" | grep -q "không hợp lệ"; then
  echo "✅ PASS: Negative quantity rejected"
else
  echo "❌ FAIL: Negative quantity accepted!"
fi

# Test 3: Instant harvest
echo "[PT-LOGIC-002] Testing instant harvest..."
# Plant crop
curl -s -X POST "$BASE_URL/api/farm/plant-crop" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0,"cropId":"carrot"}' > /dev/null

# Try to harvest immediately
RESULT=$(curl -s -X POST "$BASE_URL/api/farm/harvest-crop" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plotId":0}')

if echo "$RESULT" | grep -q "chưa lớn"; then
  echo "✅ PASS: Instant harvest prevented"
else
  echo "❌ FAIL: Instant harvest allowed!"
fi

echo ""
echo "=== Test Summary ==="
echo "Run full manual tests from PENETRATION_TESTS.md"
```

---

## Recommendations

### Before Production

1. **Complete all 22 penetration tests** và document results
2. **Fix critical/high severity findings** before deployment
3. **Enable rate limiting** middleware in PocketBase
4. **Setup monitoring** cho suspicious activity
5. **Configure alerts** for failed authentication attempts
6. **Review transaction logs** regularly for anomalies

### Ongoing Security

1. **Quarterly penetration tests**
2. **Monitor transaction logs** for patterns
3. **Update CROPS config** requires code deployment (prevents client manipulation)
4. **Regular PocketBase updates** for security patches
5. **Incident response plan** documented and practiced

---

## References

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) - Original vulnerability analysis
- [UPDATED_SECURITY_RULES.md](UPDATED_SECURITY_RULES.md) - Server-side validation architecture
- [farm_transactions.pb.js](pb_hooks/farm_transactions.pb.js) - Server API implementation
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
