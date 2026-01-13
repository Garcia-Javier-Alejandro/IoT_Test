# ESP32 Pool Control System v3.1

**Control your swimming pool remotely. Simple. Secure. Cloud-connected.**

✅ **Production Ready** | 🌐 **Cloud MQTT** | 📱 **Mobile Dashboard** | 🔒 **Encrypted Communications**

---

## What It Does

Automate your pool with **simple controls**:
- 💧 **Pump Control** - Turn pump ON/OFF remotely or on schedule
- 🌊 **Valve Modes** - Switch between Cascada (waterfall) and Eyectores (jets) modes
- 🌡️ **Temperature Monitoring** - Real-time water temperature display
- ⏱️ **Countdown Timer** - Set duration for automatic shutoff
- 📅 **Weekly Scheduling** - Create up to 3 programs, auto-execute daily
- 🎨 **Modern Dashboard** - Beautiful, responsive UI works on phone/tablet/desktop
- 🔄 **Manual Override** - Physical switches still work if needed
- 🖥️ **MQTT Control** - Integrate with Home Assistant, Node-RED, or custom apps

**No commercial subscription. Works locally. Takes 30 seconds to set up.**

---

## Quick Start

### 1. Hardware (~$50)
- ESP32 DevKit (any variant)
- Dual relay module
- DS18B20 temperature sensor
- Power supply + enclosure

[👉 Full hardware list & wiring guide](docs/WIRING_DIAGRAM.md)

### 2. Firmware (2 minutes)
```bash
# Clone repo
git clone <repo-url>
cd IoT/firmware

# Copy secrets template
cp include/"secrets (example).h" include/secrets.h

# Edit with your WiFi/MQTT credentials, then upload
platformio run --target upload
```

### 3. Dashboard (1 minute)
Dashboard auto-deploys to Cloudflare Pages. Or deploy yourself to any static host.

URL: `https://your-domain.pages.dev` → Login → Connect to MQTT broker

That's it! You now have a pool controller. 🎉

---

## Features at a Glance

| Feature | Status | Notes |
|---------|--------|-------|
| Pump & Valve Control | ✅ Active | Relay-based, no feedback sensors |
| Temperature Sensor | ✅ Active | OneWire DS18B20, 60-second updates |
| Countdown Timer | ✅ Active | Set duration & auto-shutoff |
| Weekly Scheduling | ✅ Active | Up to 3 programs, daily execution |
| WiFi Provisioning | ✅ Active | BLE (Android/macOS) or Captive Portal (iOS) |
| Manual Override | ✅ Active | Physical switches work independently |
| Event Logging | ✅ Active | Real-time log with timestamps |
| MQTT over TLS | ✅ Active | Secure end-to-end encryption |

---

## Architecture & Design

**Single-User Design** (today):
- One ESP32 controls one pool
- Dashboard runs in your browser
- Direct MQTT connection to cloud broker (HiveMQ)
- Perfect for personal use, homes, small installations
- **Requires**: Internet connection + WiFi (not offline-capable)

**How It Works:**
1. Dashboard (browser) → Internet → HiveMQ Cloud MQTT broker
2. ESP32 (WiFi) → MQTT broker → subscribes to commands
3. ESP32 → Temperature readings → MQTT broker → Dashboard
4. 100-500ms latency (depending on WiFi + internet connection)

[👉 Full architecture details](docs/ARCHITECTURE.md)

---

## Documentation

- **[Setup & Installation](docs/SETUP.md)** - Step-by-step hardware & software setup
- **[Device Provisioning](docs/DEVICE_PROVISIONING.md)** - WiFi setup (BLE or Captive Portal)
- **[Wiring Diagram](docs/WIRING_DIAGRAM.md)** - Complete hardware guide with pinouts
- **[Architecture & Design](docs/ARCHITECTURE.md)** - System design, data flow, security model
- **[API Reference](docs/API_REFERENCE.md)** - MQTT topics, control commands
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues & solutions

---

## Testing Without Hardware

Use the included simulator to test the dashboard without a real ESP32:

```bash
pip install paho-mqtt
python test_simulator.py
```

Then open dashboard and connect to the simulated device. Full feature testing.

[👉 More simulator details](docs/SETUP.md#simulator)

---

## Tech Stack

- **Hardware:** ESP32 DevKit + relay modules + DS18B20 sensor
- **Firmware:** Arduino C++ with PlatformIO
- **Dashboard:** Vanilla JavaScript (no frameworks) + HTML/CSS
- **Communication:** MQTT over WebSocket (TLS encrypted)
- **Hosting:** Cloudflare Pages (dashboard) + HiveMQ Cloud (MQTT broker)
- **Cost:** ~$10-15/month (MQTT broker only; everything else free/one-time)

---

## Security

✅ All MQTT traffic encrypted with TLS  
✅ Username/password authentication with broker  
⚠️ Credentials hardcoded in dashboard (acceptable for personal use)  

---

## Future Roadmap

Potential enhancements if needed:
- Multi-device support (different pools)
- OTA firmware updates
- Historical data analytics  
- Home Assistant integration

[👉 See full roadmap](docs/ROADMAP.md)

---

## Contributing

Found a bug? Have a feature idea? [Open an issue](https://github.com/your-repo/issues).

---

## License

MIT - Use freely for personal projects.

---

## Support

1. Check [Troubleshooting](docs/TROUBLESHOOTING.md)
2. Review [Wiring Diagram](docs/WIRING_DIAGRAM.md) for hardware issues
3. Run `test_simulator.py` to isolate firmware vs. dashboard issues
4. Open a GitHub issue with serial output & error details

---

**Built with ☕ in 2025**
