# Production Deployment Guide - Nông Trại Game

## Tổng quan

Hướng dẫn deploy authenticated mode với server-side validation vào production.

**Last Updated:** 2026-10-01  
**Status:** Production Ready ✅

---

## Architecture Overview

### Before (Milestone 12)
```
Client → PocketBase (Direct Updates)
❌ Client có thể manipulate coins, timestamps
```

### After (Milestone 13)
```
Client → Server API → PocketBase
✅ Server validates business logic
✅ Transaction logging
✅ Audit trail complete
```

---

## Prerequisites

### Software Requirements

- **PocketBase:** v0.22.0 or later
- **Node.js:** v18+ (for build)
- **Web Server:** nginx/Apache (optional, for reverse proxy)

### Hardware Requirements (100 concurrent users)

- **CPU:** 2 cores minimum, 4 cores recommended
- **RAM:** 2GB minimum, 4GB recommended
- **Disk:** 10GB minimum (includes logs, database)
- **Network:** 100 Mbps

---

## Step 1: Database Setup

### 1.1 Import Collection Schemas

```bash
# Via PocketBase Admin UI
1. Open http://your-domain:8090/_/
2. Login as admin
3. Go to Settings → Import collections
4. Import these files in order:
```

**Collections to import:**

1. `farm_players` - Updated rules (updateRule = null)
2. `farm_plots` - Updated rules (updateRule = null)
3. `farm_inventory` - Updated rules (updateRule = null)
4. `farm_quests` - Updated rules (updateRule = null)
5. `farm_transactions` - NEW collection for logging

**Schema files:**
- [farm_game_collections.json](farm_game_collections.json)
- [farm_transactions_collection.json](farm_transactions_collection.json)

### 1.2 Verify Collection Rules

```javascript
// farm_players updateRule should be:
null  // Client CANNOT update directly

// farm_plots updateRule should be:
null  // Client CANNOT update directly

// farm_inventory updateRule should be:
null  // Client CANNOT update directly

// farm_quests updateRule should be:
null  // Client CANNOT update directly

// farm_transactions createRule should be:
null  // Only server can create logs
```

### 1.3 Create Database Indexes

```sql
-- Run via PocketBase Admin → Collections → Indexes

CREATE INDEX idx_farm_plots_player ON farm_plots (player);
CREATE INDEX idx_farm_inventory_player ON farm_inventory (player);
CREATE INDEX idx_farm_quests_player ON farm_quests (player);
CREATE INDEX idx_farm_transactions_player ON farm_transactions (player);
CREATE INDEX idx_farm_transactions_type ON farm_transactions (transaction_type);
CREATE INDEX idx_farm_transactions_created ON farm_transactions (created);
```

---

## Step 2: Deploy Server Hooks

### 2.1 Copy Hook Files

```bash
# Copy transaction endpoints
cp docs/pocketbase/pb_hooks/farm_transactions.pb.js /path/to/pocketbase/pb_hooks/

# Copy quest reset hook (if not already deployed)
cp docs/pocketbase/pb_hooks/daily_quest_reset.pb.js /path/to/pocketbase/pb_hooks/

# Verify files
ls -la /path/to/pocketbase/pb_hooks/
# Should see:
# - farm_transactions.pb.js
# - daily_quest_reset.pb.js
```

### 2.2 Restart PocketBase

```bash
# Stop PocketBase
pkill pocketbase

# Start with production settings
./pocketbase serve \
  --http=0.0.0.0:8090 \
  --publicDir=/path/to/public \
  2>&1 | tee -a logs/pocketbase.log &
```

### 2.3 Verify Hooks Loaded

```bash
# Check logs for hook registration
tail -f logs/pocketbase.log | grep -E "(hook|cron)"

# Expected output:
# > Registered endpoint: POST /api/farm/buy-seed
# > Registered endpoint: POST /api/farm/plant-crop
# > Registered endpoint: POST /api/farm/harvest-crop
# > Registered endpoint: POST /api/farm/sell-crop
# > Registered cron job: daily_quest_reset (0 0 * * *)
```

---

## Step 3: Update Client Code

### 3.1 Install Dependencies

```bash
cd /path/to/JobConnect
npm install
```

### 3.2 Update Environment Variables

```bash
# .env.production
VITE_POCKETBASE_URL=https://your-production-domain.com
```

### 3.3 Build Client

```bash
# Production build
npm run build

# Verify build
ls -la dist/
# Should see index.html, assets/, etc.
```

### 3.4 Deploy Client Files

```bash
# Copy to web server
rsync -avz dist/ user@server:/var/www/farm-game/

# Or upload to CDN/static hosting
# - Vercel, Netlify, Cloudflare Pages, etc.
```

---

## Step 4: Configure Reverse Proxy (Optional)

### 4.1 Nginx Configuration

```nginx
# /etc/nginx/sites-available/farm-game

server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Client files
    location / {
        root /var/www/farm-game;
        try_files $uri $uri/ /index.html;
    }

    # PocketBase API
    location /api {
        proxy_pass http://localhost:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # PocketBase realtime
    location /_/ {
        proxy_pass http://localhost:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4.2 Enable and Test

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/farm-game /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

---

## Step 5: Security Hardening

### 5.1 Enable HTTPS

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### 5.2 Configure CORS

```javascript
// In pb_hooks/cors.pb.js (if needed)
onBeforeServe((e) => {
  e.router.use((c) => {
    c.response().header().set('Access-Control-Allow-Origin', 'https://your-domain.com');
    c.response().header().set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.response().header().set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return c.next();
  });
});
```

### 5.3 Enable Rate Limiting

```javascript
// In pb_hooks/rate_limit.pb.js
onBeforeServe((e) => {
  e.router.use((c) => {
    const userId = c.get("authRecord")?.id;
    if (!userId) return c.next();

    const key = `rate_limit:${userId}`;
    const count = $app.cache().get(key) || 0;

    if (count >= 60) {
      return c.json(429, { error: "Too many requests" });
    }

    $app.cache().set(key, count + 1, 60);
    return c.next();
  });
});
```

### 5.4 Firewall Rules

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# PocketBase port 8090 should NOT be exposed publicly
# Only accessible via nginx reverse proxy
```

---

## Step 6: Monitoring Setup

### 6.1 Application Monitoring

```bash
# Create monitoring script
cat > /usr/local/bin/monitor-farm-game.sh << 'EOF'
#!/bin/bash

LOG_FILE="/var/log/farm-game-monitor.log"

echo "=== $(date) ===" >> $LOG_FILE

# Check PocketBase process
if pgrep -x "pocketbase" > /dev/null; then
    echo "PocketBase: Running ✓" >> $LOG_FILE
else
    echo "PocketBase: Not running ✗" >> $LOG_FILE
    # Restart
    cd /path/to/pocketbase && ./pocketbase serve &
fi

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "Disk usage: ${DISK_USAGE}% ⚠️" >> $LOG_FILE
fi

# Check memory
MEM_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')
if [ $MEM_USAGE -gt 90 ]; then
    echo "Memory usage: ${MEM_USAGE}% ⚠️" >> $LOG_FILE
fi

# Check API endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/_/)
if [ $HTTP_CODE -eq 200 ]; then
    echo "API health: OK ✓" >> $LOG_FILE
else
    echo "API health: Failed (HTTP $HTTP_CODE) ✗" >> $LOG_FILE
fi
EOF

chmod +x /usr/local/bin/monitor-farm-game.sh

# Add to crontab (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/monitor-farm-game.sh") | crontab -
```

### 6.2 Log Rotation

```bash
# /etc/logrotate.d/farm-game
/var/log/farm-game-monitor.log
/path/to/pocketbase/pb_data/logs/*.log
{
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

### 6.3 Database Backup

```bash
# Create backup script
cat > /usr/local/bin/backup-farm-db.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/backups/farm-game"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="/path/to/pocketbase/pb_data/data.db"

mkdir -p $BACKUP_DIR

# Backup database
cp $DB_PATH $BACKUP_DIR/data_$DATE.db

# Compress old backups (older than 7 days)
find $BACKUP_DIR -name "data_*.db" -mtime +7 -exec gzip {} \;

# Delete backups older than 30 days
find $BACKUP_DIR -name "data_*.db.gz" -mtime +30 -delete

echo "Backup completed: data_$DATE.db"
EOF

chmod +x /usr/local/bin/backup-farm-db.sh

# Daily backup at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-farm-db.sh") | crontab -
```

---

## Step 7: Testing in Production

### 7.1 Smoke Tests

```bash
# Test 1: Health check
curl https://your-domain.com/api/collections

# Test 2: Authentication
curl -X POST https://your-domain.com/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -d '{"cropId":"carrot"}'
# Expected: 400 Unauthorized (good - requires auth)

# Test 3: With auth
TOKEN="<your_test_user_token>"
curl -X POST https://your-domain.com/api/farm/buy-seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cropId":"carrot"}'
# Expected: 200 OK with player/inventory data
```

### 7.2 Load Test (Optional)

```bash
# Run k6 load test against production
k6 run --vus 10 --duration 60s \
  -e BASE_URL=https://your-domain.com \
  -e TOKEN=$TOKEN \
  load-test-gameplay.js
```

### 7.3 Security Test (Optional)

```bash
# Run penetration tests
# See PENETRATION_TESTS.md for full suite

# Quick test: Try to manipulate coins directly
curl -X PATCH https://your-domain.com/api/collections/farm_players/records/$PLAYER_ID \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"coins":999999}'
# Expected: 403 Forbidden (updateRule = null)
```

---

## Step 8: Go Live Checklist

### Pre-Launch

- [ ] Database collections imported with correct rules
- [ ] Server hooks deployed and verified
- [ ] Client code built and deployed
- [ ] HTTPS enabled with valid certificate
- [ ] Rate limiting configured
- [ ] Monitoring setup complete
- [ ] Backup automation running
- [ ] Smoke tests passed
- [ ] Load tests passed (optional)
- [ ] Security tests passed (optional)

### Launch Day

- [ ] Announce maintenance window (if migrating from old system)
- [ ] Deploy new code
- [ ] Monitor logs for errors
- [ ] Check transaction logs populating
- [ ] Verify user registrations working
- [ ] Test full gameplay loop with real account
- [ ] Monitor server resources (CPU, RAM, disk)
- [ ] Check error rates in monitoring

### Post-Launch (First 24 Hours)

- [ ] Monitor transaction volume
- [ ] Check for failed transactions
- [ ] Review security logs
- [ ] Verify daily quest reset (next midnight)
- [ ] Check database size growth
- [ ] Validate backup completed
- [ ] Review user feedback/bug reports

---

## Rollback Plan

### If Critical Issues Found

```bash
# 1. Stop new traffic (maintenance mode)
# Add to nginx config:
location / {
    return 503 "Maintenance in progress";
}
sudo systemctl reload nginx

# 2. Revert client code
cd /var/www/farm-game
git checkout <previous_commit>
npm run build
rsync -avz dist/ .

# 3. Revert server hooks (if needed)
cd /path/to/pocketbase/pb_hooks
mv farm_transactions.pb.js farm_transactions.pb.js.backup
# Restart PocketBase

# 4. Restore database (if needed)
cp /backups/farm-game/data_<timestamp>.db /path/to/pocketbase/pb_data/data.db

# 5. Re-enable traffic
# Remove maintenance mode from nginx config
sudo systemctl reload nginx
```

---

## Scaling Considerations

### When to Scale

**Indicators:**
- CPU usage > 80% sustained
- Response time p95 > 500ms
- Database size > 5GB
- Concurrent users > 200

### Horizontal Scaling

```
                Load Balancer (nginx)
                        |
        +---------------+---------------+
        |               |               |
   PocketBase 1   PocketBase 2   PocketBase 3
        |               |               |
        +---------------+---------------+
                        |
                  PostgreSQL
            (migrate from SQLite)
```

### Database Migration (SQLite → PostgreSQL)

When database size > 5GB or need multi-instance:

1. Export data from PocketBase
2. Setup PostgreSQL
3. Configure PocketBase to use PostgreSQL
4. Import data
5. Test thoroughly before switching

---

## Troubleshooting

### Issue 1: 502 Bad Gateway

**Cause:** PocketBase not running or nginx can't connect

**Fix:**
```bash
# Check PocketBase
ps aux | grep pocketbase

# Check nginx config
sudo nginx -t

# Check firewall
sudo ufw status
```

### Issue 2: High CPU Usage

**Cause:** Too many concurrent requests or inefficient queries

**Fix:**
```bash
# Check slow queries in logs
tail -f pb_data/logs/*.log | grep "duration > 100ms"

# Add indexes (see Step 1.3)
# Enable rate limiting (see Step 5.3)
```

### Issue 3: Transaction Logs Not Created

**Cause:** Hook not loaded or permissions issue

**Fix:**
```bash
# Verify hook loaded
tail -f logs/pocketbase.log | grep "farm_transactions"

# Check farm_transactions collection exists
curl http://localhost:8090/api/collections/farm_transactions

# Verify createRule = null (only server can create)
```

---

## Support & Maintenance

### Regular Tasks

**Daily:**
- Check monitoring logs
- Review error rates
- Verify backups completed

**Weekly:**
- Review transaction logs for anomalies
- Check disk space usage
- Update dependencies (security patches)

**Monthly:**
- Performance review (response times, throughput)
- Security audit (failed auth attempts, suspicious patterns)
- Database optimization (vacuum, reindex)

### Contact

- **Documentation:** [docs/pocketbase/](.)
- **Security Issues:** Report immediately to admin
- **Bug Reports:** GitHub Issues

---

## References

- [UPDATED_SECURITY_RULES.md](UPDATED_SECURITY_RULES.md) - Security architecture
- [farm_transactions.pb.js](pb_hooks/farm_transactions.pb.js) - Server API implementation
- [PENETRATION_TESTS.md](PENETRATION_TESTS.md) - Security test suite
- [LOAD_TESTING.md](LOAD_TESTING.md) - Performance test suite
- [PocketBase Going to Production](https://pocketbase.io/docs/going-to-production/)
