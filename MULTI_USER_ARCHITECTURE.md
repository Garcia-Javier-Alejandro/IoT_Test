# Multi-User Architecture Guide

**Status:** 📋 Planning Document  
**Current Phase:** Phase 1 (Single-User)  
**Target:** Phase 2 (Multi-User SaaS)

---

## Overview

This document describes the architecture for scaling the ESP32 Pool Controller from a single-user system to a multi-tenant SaaS platform where multiple users can each manage their own pool devices.

---

## Current Architecture (Phase 1)

### Single-User Model

```
┌─────────────┐
│  Dashboard  │ ──┐
└─────────────┘   │
                  │  Shared MQTT User
┌─────────────┐   │  (User-dashboard-01 / Manzana1)
│  Dashboard  │ ──┤
└─────────────┘   │
                  ▼
         ┌────────────────┐
         │  MQTT Broker   │
         │  (HiveMQ)      │
         └────────────────┘
                  │
                  │  Topics: devices/esp32-pool-01/*
                  │
         ┌────────────────┐
         │  ESP32 Device  │
         │  (Pool-01)     │
         └────────────────┘
```

**Characteristics:**
- ✅ Simple deployment
- ✅ No user management needed
- ✅ Suitable for single family/location
- ⚠️ All users see all devices
- ⚠️ No access control
- ⚠️ Cannot scale to multiple customers

---

## Future Architecture (Phase 2)

### Multi-User SaaS Model

```
┌─────────────┐                    ┌─────────────┐
│  User: John │                    │ User: Mary  │
│  Dashboard  │                    │  Dashboard  │
└─────────────┘                    └─────────────┘
      │                                   │
      │ 1. Login (john/password)          │ 1. Login (mary/password)
      ▼                                   ▼
┌──────────────────────────────────────────────────┐
│           Backend API Server                     │
│  ┌────────────────┐  ┌─────────────────────┐   │
│  │ Authentication │  │ MQTT Credentials DB │   │
│  │   Service      │  │                     │   │
│  └────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────┘
      │                                   │
      │ 2. Returns:                       │ 2. Returns:
      │ {mqttUser: "mqtt_john_123",       │ {mqttUser: "mqtt_mary_456",
      │  mqttPass: "...",                 │  mqttPass: "...",
      │  topicPrefix: "users/john"}       │  topicPrefix: "users/mary"}
      ▼                                   ▼
         ┌────────────────────────────────────┐
         │         MQTT Broker (HiveMQ)       │
         │                                    │
         │  ACL Rules:                        │
         │  - mqtt_john_123 → users/john/#    │
         │  - mqtt_mary_456 → users/mary/#    │
         └────────────────────────────────────┘
                  │                 │
    ┌─────────────┘                 └─────────────┐
    │                                             │
    │ Topics: users/john/devices/pool-01/*        │ Topics: users/mary/devices/pool-01/*
    │                                             │
┌────────────────┐                        ┌────────────────┐
│  ESP32 Device  │                        │  ESP32 Device  │
│  (John's Pool) │                        │  (Mary's Pool) │
└────────────────┘                        └────────────────┘
```

**Characteristics:**
- ✅ User isolation
- ✅ Scalable to thousands of users
- ✅ Access control enforced by MQTT broker
- ✅ Per-user device management
- ✅ Audit logging per user
- ✅ SaaS business model ready

---

## Implementation Plan

### 1. Backend API Development

#### 1.1 User Authentication Service

**Endpoints:**
```javascript
POST /api/auth/register
{
  "username": "john",
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
Response: { "userId": "user_123", "message": "Registration successful" }

POST /api/auth/login
{
  "username": "john",
  "password": "SecurePassword123!"
}
Response: { 
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}

POST /api/auth/logout
Headers: { "Authorization": "Bearer <token>" }
Response: { "message": "Logged out successfully" }
```

#### 1.2 MQTT Credentials API

**Endpoint:**
```javascript
GET /api/auth/mqtt-credentials
Headers: { "Authorization": "Bearer <token>" }

Response: {
  "mqttUser": "mqtt_john_123",
  "mqttPass": "auto_generated_secure_password",
  "topicPrefix": "users/john",
  "brokerUrl": "wss://broker.hivemq.cloud:8884/mqtt"
}
```

**Implementation Logic:**
```javascript
// Pseudo-code
async function getMQTTCredentials(userId) {
  // Check if user already has MQTT credentials
  let credentials = await db.query(
    "SELECT mqtt_user, mqtt_pass FROM mqtt_credentials WHERE user_id = ?",
    [userId]
  );
  
  if (!credentials) {
    // Generate new MQTT credentials for this user
    const mqttUser = `mqtt_${userId}_${generateRandomId()}`;
    const mqttPass = generateSecurePassword();
    
    // Store in database (hash the password)
    await db.query(
      "INSERT INTO mqtt_credentials (user_id, mqtt_user, mqtt_pass_hash) VALUES (?, ?, ?)",
      [userId, mqttUser, bcrypt.hash(mqttPass)]
    );
    
    // Create MQTT broker user via HiveMQ Cloud API
    await hivemqAPI.createUser(mqttUser, mqttPass, {
      permissions: [`users/${username}/#`]
    });
    
    credentials = { mqtt_user: mqttUser, mqtt_pass: mqttPass };
  }
  
  return {
    mqttUser: credentials.mqtt_user,
    mqttPass: credentials.mqtt_pass,
    topicPrefix: `users/${username}`,
    brokerUrl: process.env.MQTT_BROKER_URL
  };
}
```

---

### 2. Database Schema

```sql
-- Users table
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email)
);

-- MQTT Credentials table
CREATE TABLE mqtt_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  mqtt_user VARCHAR(100) UNIQUE NOT NULL,
  mqtt_pass_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_mqtt_user (mqtt_user)
);

-- Devices table
CREATE TABLE devices (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) DEFAULT 'pool-controller',
  topic_prefix VARCHAR(200) NOT NULL, -- e.g., "users/john/devices/pool-01"
  last_seen TIMESTAMP,
  status VARCHAR(20) DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_topic_prefix (topic_prefix)
);

-- Sessions table (for JWT token management)
CREATE TABLE sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
);
```

---

### 3. MQTT Broker Configuration

#### HiveMQ Cloud ACL (Access Control List)

**Configure per-user topic permissions:**

```yaml
# User: mqtt_john_123
permissions:
  - topic: "users/john/#"
    access: ["publish", "subscribe"]
  - topic: "users/mary/#"
    access: []  # Deny access to other users' topics

# User: mqtt_mary_456
permissions:
  - topic: "users/mary/#"
    access: ["publish", "subscribe"]
  - topic: "users/john/#"
    access: []  # Deny access to other users' topics
```

**Using HiveMQ Cloud API:**
```javascript
// Create MQTT user with topic restrictions
async function createMQTTUserWithACL(mqttUser, mqttPass, topicPrefix) {
  const response = await fetch('https://api.hivemq.cloud/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HIVEMQ_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: mqttUser,
      password: mqttPass,
      permissions: [
        {
          topic: `${topicPrefix}/#`,
          allow: {
            publish: true,
            subscribe: true
          }
        }
      ]
    })
  });
  
  return response.json();
}
```

---

### 4. Dashboard Updates

#### 4.1 Add Login Page

Create `login.html`:
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Smart Pool - Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 flex items-center justify-center min-h-screen">
  <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
    <h1 class="text-2xl font-bold mb-6">Smart Pool Login</h1>
    
    <form id="login-form">
      <div class="mb-4">
        <label class="block text-sm font-semibold mb-2">Username</label>
        <input type="text" id="username" class="w-full px-4 py-2 border rounded-lg" required>
      </div>
      
      <div class="mb-6">
        <label class="block text-sm font-semibold mb-2">Password</label>
        <input type="password" id="password" class="w-full px-4 py-2 border rounded-lg" required>
      </div>
      
      <button type="submit" class="w-full bg-primary text-white py-3 rounded-lg font-bold">
        Login
      </button>
    </form>
    
    <p class="text-center mt-4 text-sm text-slate-600">
      Don't have an account? <a href="register.html" class="text-primary font-semibold">Register</a>
    </p>
  </div>
  
  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('authToken', data.token);
          window.location.href = 'index.html';
        } else {
          alert('Login failed. Please check your credentials.');
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });
  </script>
</body>
</html>
```

#### 4.2 Update index.html

Add authentication check:
```javascript
// At top of index.html or app.js
document.addEventListener('DOMContentLoaded', () => {
  const authToken = localStorage.getItem('authToken');
  
  if (!authToken) {
    // Not logged in - redirect to login page
    window.location.href = 'login.html';
    return;
  }
  
  // Verify token is still valid
  fetch('/api/auth/verify', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  }).then(response => {
    if (!response.ok) {
      // Token expired or invalid
      localStorage.removeItem('authToken');
      window.location.href = 'login.html';
    }
  });
  
  // Continue with app initialization...
});
```

#### 4.3 Update getMQTTCredentials()

Uncomment Phase 2 code in `app.js`:
```javascript
async function getMQTTCredentials() {
  const authToken = localStorage.getItem('authToken');
  
  if (!authToken) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch('/api/auth/mqtt-credentials', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get MQTT credentials');
  }
  
  const data = await response.json();
  
  // Store topic prefix globally for use in topic construction
  window.APP_CONFIG.TOPIC_PREFIX = data.topicPrefix;
  
  return {
    user: data.mqttUser,
    pass: data.mqttPass
  };
}
```

#### 4.4 Update Topic Construction

Modify topics to use user prefix:
```javascript
// Instead of hardcoded:
TOPIC_PUMP_CMD: "devices/esp32-pool-01/pump/set"

// Use dynamic prefix:
TOPIC_PUMP_CMD: `${window.APP_CONFIG.TOPIC_PREFIX}/devices/pool-01/pump/set`
// Result for John: "users/john/devices/pool-01/pump/set"
// Result for Mary: "users/mary/devices/pool-01/pump/set"
```

---

### 5. ESP32 Firmware Updates

#### Update MQTT Connection

Modify `main.cpp` to support user-specific topics:

```cpp
// In secrets.h or config.h
#define TOPIC_PREFIX "users/john"  // Will be provisioned per device

// Update topic macros
#define TOPIC_PUMP_SET      TOPIC_PREFIX "/devices/" DEVICE_ID "/pump/set"
#define TOPIC_PUMP_STATE    TOPIC_PREFIX "/devices/" DEVICE_ID "/pump/state"
// ... etc
```

#### Device Provisioning

Add user binding during BLE provisioning:
```cpp
// New characteristic: USER_ID_CHAR_UUID
// Dashboard sends user ID during provisioning
// ESP32 stores it in NVS along with WiFi credentials
// Topics are constructed with user prefix
```

---

## Migration Path

### Step-by-Step Migration

**Week 1: Backend Setup**
1. Set up backend server (Node.js/Express, Python/FastAPI, etc.)
2. Implement user authentication endpoints
3. Create database schema
4. Deploy to cloud (Heroku, AWS, Google Cloud)

**Week 2: MQTT Integration**
1. Set up HiveMQ Cloud API access
2. Implement MQTT credential generation
3. Configure ACL rules per user
4. Test topic isolation

**Week 3: Dashboard Updates**
1. Create login/register pages
2. Update `getMQTTCredentials()` to Phase 2
3. Add authentication checks
4. Update topic construction to use prefixes

**Week 4: Testing & Migration**
1. Test with multiple test users
2. Verify topic isolation
3. Load testing with simulated users
4. Gradual rollout to production

**Week 5: ESP32 Updates**
1. Update firmware with user binding
2. BLE provisioning includes user ID
3. OTA update existing devices
4. Monitor device connections

---

## Security Considerations

### Authentication
- ✅ Use bcrypt or Argon2 for password hashing
- ✅ Implement JWT with short expiration (1 hour)
- ✅ Use refresh tokens for extended sessions
- ✅ Rate limiting on login attempts
- ✅ HTTPS only for all API calls

### MQTT Security
- ✅ TLS/SSL for all MQTT connections
- ✅ Per-user credentials (never shared)
- ✅ ACL enforced at broker level
- ✅ Regular credential rotation
- ✅ Monitor for unusual activity

### Data Privacy
- ✅ Users can only see their own data
- ✅ GDPR compliance (data export, deletion)
- ✅ Audit logs for access
- ✅ Encrypted data at rest and in transit

---

## Cost Considerations

### HiveMQ Cloud Pricing (Example)

| Tier | Users | Connections | Price/Month |
|------|-------|-------------|-------------|
| **Starter** | 1-10 | 100 | $49 |
| **Professional** | 10-100 | 1,000 | $249 |
| **Enterprise** | 100+ | 10,000+ | Custom |

**Scaling Factors:**
- 1 user = 1 dashboard connection + N devices
- Typical: 1 user = 2 connections (1 dashboard + 1 device)
- 100 users = ~200 connections

---

## Success Metrics

### Phase 2 Goals
- ✅ Support 100+ concurrent users
- ✅ <100ms API response time
- ✅ 99.9% uptime SLA
- ✅ Zero data leakage between users
- ✅ User satisfaction >90%

---

## References

- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [HiveMQ Cloud Documentation](https://docs.hivemq.com/hivemq-cloud/)
- [MQTT Security Best Practices](https://www.hivemq.com/mqtt-security-fundamentals/)
- [OAuth 2.0 Specification](https://oauth.net/2/)
