# Architecture & Scalability Notes

## Current Single-Tenant Design

### Why Direct Dashboard → MQTT Connection?

**Advantages:**
1. ✅ **Simple** - No backend required, runs entirely at the edge
2. ✅ **Real-time** - WebSocket connection = instant updates (100-500ms latency)
3. ✅ **Cost-effective** - Serverless design, minimal infrastructure
4. ✅ **Offline-capable** - Dashboard can work without backend services
5. ✅ **Responsive** - Direct connection vs. backend hop = lower latency

**Disadvantages:**
1. ❌ **Credentials in code** - MQTT broker password visible in browser
2. ❌ **No multi-tenancy** - One broker per deployment
3. ❌ **Scaling issues** - Can't easily add multiple devices/pools
4. ❌ **No user management** - No access control or permissions
5. ❌ **Security risk** - Credentials could be compromised if code is leaked

### Current Setup

```
User → Browser/Dashboard → Direct MQTT → HiveMQ Cloud → ESP32
                            (hardcoded creds)
```

---

## Future: Multi-Tenant Backend Proxy

### Architecture

```
User A ┐
User B ├─→ Browser/Dashboard ─→ Backend Gateway ─→ MQTT Broker A ─→ ESP32-A
User C ┘     (single codebase)   (credential      MQTT Broker B ─→ ESP32-B
                                  manager)         MQTT Broker C ─→ ESP32-C
                                                   ...
```

### Backend Gateway Responsibilities

1. **Authentication**
   - User login/password verification
   - JWT token generation
   - Session management

2. **Credential Management**
   - Securely store MQTT credentials per customer
   - Encrypt at rest
   - Inject into WebSocket URL dynamically

3. **Proxying**
   - Accept WebSocket connections from dashboard
   - Route to correct MQTT broker based on user
   - Tunnel MQTT messages bidirectionally

4. **Features**
   - User management (role-based access control)
   - Device management (list, add, remove pools)
   - Usage tracking (for billing/analytics)
   - Audit logging
   - Rate limiting

### Example Backend Proxy Flow

**Login:**
```
1. User sends credentials to backend → POST /api/login
2. Backend authenticates, generates JWT + MQTT gateway URL
3. Dashboard receives: 
   {
     token: "eyJhbGc...",
     mqttGateway: "wss://gateway.example.com:8884/mqtt",
     brokerUrl: "wss://gateway.example.com:8884/mqtt",
     clientId: "dashboard-user-123"
   }
4. Dashboard connects to gateway instead of direct MQTT
5. Gateway proxies to customer's MQTT broker
```

**Message Flow:**
```
Browser → Backend Gateway → Customer MQTT Broker → ESP32
  (encrypted)              (validates user has   (receives
   over TLS                access to this pool)  command)
```

### Technology Options for Backend

**Option 1: Node.js + Express + MQTT.js**
- Pros: JavaScript ecosystem, easy WebSocket handling
- Cons: Requires Node.js infrastructure
- Cost: ~$20-50/month (basic server)

**Option 2: Cloudflare Workers + Durable Objects**
- Pros: Serverless, scales automatically
- Cons: Complex state management
- Cost: ~$5-20/month (pay-as-you-go)

**Option 3: AWS Lambda + API Gateway**
- Pros: Managed, scales infinitely
- Cons: Complex setup, cold starts
- Cost: ~$10-100/month depending on usage

**Option 4: Embedded Python (aiohttp + asyncio)**
- Pros: Simple, lightweight, easy to understand
- Cons: Need to host somewhere
- Cost: ~$20-50/month (basic server)

---

## Migration Path

### Phase 1: Current (Today ✅)
- Single pool, hardcoded MQTT
- Dashboard in browser
- Credentials in code
- Personal use only

### Phase 2: Credential Provisioning (Next)
- Keep single-tenant for now
- Add WiFiManager for ESP32 WiFi setup
- (Already implemented in feature/wifi-provisioning branch)

### Phase 3: Multi-Device Support (Future)
- Support multiple ESP32s on same MQTT broker
- Device selector in dashboard UI
- Multiple topic prefixes

### Phase 4: Multi-Tenant Backend (If Needed)
- Build backend gateway
- Implement user authentication
- Support multiple MQTT brokers
- Add billing/analytics
- Commercial deployment ready

---

## Current Deployment Architecture

### Frontend (Dashboard)
- **Hosted**: Cloudflare Pages (free tier)
- **Files**: `/docs` directory
- **Build**: Static HTML/CSS/JS
- **Auto-deploy**: On push to `main` branch
- **Access**: `https://your-domain.pages.dev`

### Backend (MQTT Broker)
- **Hosted**: HiveMQ Cloud (managed)
- **Tier**: Hobby (free for development)
- **Features**: TLS, WebSocket, retained messages
- **Cost**: $0-10/month depending on messages/connections
- **Scalability**: Limited by tier, but adequate for 1-10 devices

### Firmware (ESP32)
- **Deployment**: PlatformIO upload via USB
- **WiFi**: Auto-provisioning via captive portal (new)
- **MQTT**: Direct connection to HiveMQ
- **Updates**: Manual via USB (future: OTA)

---

## Recommended Path Forward

### For Personal Use (Status Quo) ✅
- Keep current simple architecture
- Focus on features (timers, schedules, automations)
- Improve ESP32 firmware reliability
- Better WiFi provisioning

### For Small Business (Multi-Device)
1. Add device selector to dashboard
2. Support multiple ESP32s on same broker
3. Add basic authentication (username/password)
4. Implement OTA firmware updates

### For Commercial (Multi-Customer)
1. Build backend gateway
2. Implement full user/device management
3. Add billing integration
4. Security audit (penetration testing)
5. SLA and support infrastructure

---

## Security Considerations

### Current Threats & Mitigations

| Threat | Impact | Current Mitigation | Future |
|--------|--------|-------------------|--------|
| Credentials in code | HIGH | TLS encryption | Backend vault |
| MQTT broker hijacking | CRITICAL | TLS + password auth | Broker replication |
| Man-in-the-middle | MEDIUM | TLS only | mTLS certificates |
| Unauthorized access | HIGH | Device isolation | RBAC + JWT |
| DDoS | MEDIUM | Not applicable | Rate limiting |

### Best Practices (Current)
- ✅ Always use TLS (never unencrypted MQTT)
- ✅ Strong MQTT password (20+ chars)
- ✅ Keep `secrets.h` in `.gitignore`
- ✅ Use retained messages carefully
- ✅ Validate all MQTT payloads

### Best Practices (Future Backend)
- 🔒 OAuth2 / JWT authentication
- 🔒 Hardware security modules (HSM)
- 🔒 Credential rotation
- 🔒 Audit logging
- 🔒 Rate limiting
- 🔒 DDoS protection (Cloudflare, AWS Shield)
- 🔒 Regular security audits

---

## Decision Matrix

Use this to decide which architecture to implement:

| Need | Current | Phase 3 | Phase 4 |
|------|---------|---------|---------|
| Single pool | ✅ Perfect | ✅ Overkill | ❌ Overkill |
| Multiple pools (same user) | ⚠️ Hacky | ✅ Good | ✅ Perfect |
| Multiple users | ❌ Impossible | ❌ Impossible | ✅ Perfect |
| Commercial SaaS | ❌ Impossible | ❌ Impossible | ✅ Perfect |
| Time to implement | ✅ Done | 📅 1-2 weeks | 📅 4-8 weeks |
| Monthly cost | 💰 ~$10 | 💰 ~$20 | 💰 ~$50-200 |
| Complexity | 💡 Very Low | 📊 Medium | 🔧 High |

---

## References

- [MQTT Protocol Overview](https://mqtt.org/)
- [HiveMQ Cloud Documentation](https://docs.hivemq.cloud/)
- [MQTT Security Best Practices](https://www.hivemq.com/article/mqtt-security-best-practices/)
- [Node.js MQTT Proxy Example](https://github.com/moscajs/mosca)
- [Cloudflare Workers for MQTT](https://developers.cloudflare.com/workers/)
