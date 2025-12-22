# Pool Control System - Wiring Diagram

## Hardware Components
- ESP32 DevKit V1
- 3× Songle SRD-05VDC-SL-C relays
- 3× 2N2222 transistors (or BC547)
- 3× 1N4007 diodes
- 3× 1kΩ resistors
- 3× 10kΩ resistors
- 1× ZMPT101B AC voltage sensor (220V pump sensing)
- 1× 25V DC voltage sensor module (24V valve sensing)
- 5V power supply (2A minimum)

---

## GPIO Pin Assignment

### Outputs (Relay Control)
```
GPIO 19 → PUMP_RELAY_PIN      (Latching pulse for pump contactor)
GPIO 18 → VALVE1_RELAY_PIN    (NO valve relay)
GPIO 17 → VALVE2_RELAY_PIN    (NC valve relay)
```

### Inputs (State Feedback)
```
GPIO 36 (ADC1_0) → PUMP_SENSE_PIN   (ZMPT101B analog input)
GPIO 39 (ADC1_3) → VALVE_SENSE_PIN  (24V sensor analog input)
```

---

## Relay Driver Circuit (Repeat for Each of 3 Relays)

```
ESP32 GPIO Pin ──[1kΩ]──┬── 2N2222 Base (pin 1)
                        │
                      [10kΩ]
                        │
                       GND

2N2222 Collector (pin 2) ── Relay Coil (+) ── 5V
2N2222 Emitter (pin 3) ───── GND

           ┌────[1N4007]────┐  ← Flyback diode
           │   (Band to 5V) │     (Cathode to +5V side)
           │                │
        Relay Coil (+) ── Relay Coil (-)
```

**Per Relay Wiring:**
| Relay # | GPIO Pin | Purpose |
|---------|----------|---------|
| Relay 1 | GPIO 19  | Pump contactor pulse |
| Relay 2 | GPIO 18  | Valve 1 (NO) pulse |
| Relay 3 | GPIO 17  | Valve 2 (NC) pulse |

---

## Relay Contacts → Latching Contactors (Parallel Control)

### Pump Circuit
```
Manual Button (momentary) ───┐
                             ├──→ Pump Latching Contactor Coil (24V)
Pump Relay COM ──────────────┘
    │
    └── Pump Relay NO contact (closes during 100ms pulse)
```

**Operation:**
- Manual button OR relay can send 100ms pulse to toggle pump contactor
- Both connected in parallel → either can trigger
- Manual button always functional (independent of ESP32)

### Valve Circuit (Mode 1)
```
Manual Button Mode 1 ────┐
                         ├──→ Valve Latching Contactor Coil (24V)
Valve1 Relay COM ────────┘
    │
    └── Valve1 Relay NO (closes during pulse)

Valve2 Relay OFF (no pulse)
```

### Valve Circuit (Mode 2)
```
Manual Button Mode 2 ────┐
                         ├──→ Valve Latching Contactor Coil (24V)
Valve2 Relay COM ────────┘
    │
    └── Valve2 Relay NO (closes during pulse)

Valve1 Relay OFF (no pulse)
```

**Operation:**
- To switch to Mode 1: Energize Valve1 relay for 100ms
- To switch to Mode 2: Energize Valve2 relay for 100ms
- Manual buttons work independently

---

## State Feedback Sensors

### ZMPT101B (Pump 220V AC Sensing)
```
220V Hot ──────┬── ZMPT101B Input Terminal 1
               │
            [PUMP LOAD]
               │
220V Neutral ──┴── ZMPT101B Input Terminal 2

ZMPT101B:
  VCC → 5V
  GND → GND
  OUT → ESP32 GPIO 36 (ADC1_0)
```

**Readings:**
- No voltage: ADC reads ~0-100
- 220V present: ADC reads 2000-4095
- Code: `analogRead(36) > 1000` → Pump is ON

### 25V DC Sensor (Valve 24V Sensing)
```
24V+ (to valves) ── DC Sensor Input (+)
24V- (GND) ───────── DC Sensor Input (-)

DC Sensor:
  OUT → ESP32 GPIO 39 (ADC1_3)
  GND → GND
```

**Readings:**
- No voltage: ADC reads ~0-100
- 24V present: ADC reads 2000-4095
- Code: `analogRead(39) > 1000` → Valves are powered

---

## Power Distribution

### 5V Rail (for ESP32 + Relays)
```
5V Power Supply (+) ──┬── ESP32 VIN (or 5V pin)
                      ├── Relay 1 VCC
                      ├── Relay 2 VCC
                      ├── Relay 3 VCC
                      └── ZMPT101B VCC

5V Power Supply (-) ──┬── ESP32 GND
                      ├── All relay GND
                      ├── All transistor emitters
                      └── ZMPT101B GND
```

**Current requirement:** ~500mA (ESP32 + 3 relays)

### 24V Rail (External - Already Exists)
```
24V Supply ──┬── Valve Contactors
             ├── Pump Contactor Coil
             └── DC Voltage Sensor Input
```

---

## Complete System Diagram (ASCII)

```
                    ┌──────────────────────────────────────┐
                    │          ESP32 DevKit V1             │
                    │                                      │
   ┌────────────────┤ GPIO 19 (Pump Relay)                 │
   │  ┌─────────────┤ GPIO 18 (Valve1 Relay)               │
   │  │  ┌──────────┤ GPIO 17 (Valve2 Relay)               │
   │  │  │          │                                      │
   │  │  │          │ GPIO 36 (ADC) ◄── ZMPT101B           │
   │  │  │          │ GPIO 39 (ADC) ◄── 24V Sensor         │
   │  │  │          │                                      │
   │  │  │          │ VIN ◄── 5V Supply                    │
   │  │  │          │ GND ◄── GND                          │
   │  │  │          └──────────────────────────────────────┘
   │  │  │
   │  │  │          ┌────────────────┐
   │  │  └─────────►│ Transistor +   │
   │  │             │ Relay 3        ├──► Valve2 Contactor (24V)
   │  │             │ (Valve2)       │    (Mode 2 pulse)
   │  │             └────────────────┘
   │  │
   │  │             ┌────────────────┐
   │  └────────────►│ Transistor +   │
   │                │ Relay 2        ├──► Valve1 Contactor (24V)
   │                │ (Valve1)       │    (Mode 1 pulse)
   │                └────────────────┘
   │
   │                ┌────────────────┐
   └───────────────►│ Transistor +   │
                    │ Relay 1        ├──► Pump Contactor (24V)
                    │ (Pump)         │    (Toggle pulse)
                    └────────────────┘

        220V ──┬── ZMPT101B ──► ESP32 GPIO36
               │
           [PUMP MOTOR]
               │
        Neutral ┘

        24V ──┬── DC Sensor ──► ESP32 GPIO39
              │
          [VALVES]
              │
         GND ─┘
```

---

## Safety Considerations

1. **High Voltage Isolation:**
   - ZMPT101B provides galvanic isolation for 220V sensing
   - Never connect ESP32 GPIO directly to 220V

2. **Relay Ratings:**
   - Songle SRD-05VDC-SL-C rated for 10A @ 250VAC
   - Pump contactor coil is 24V (well within limits)
   - Use appropriately sized wires for contactor coil circuit

3. **Flyback Protection:**
   - 1N4007 diodes across relay coils prevent voltage spikes
   - Essential for ESP32 longevity

4. **Enclosure:**
   - Use IP65-rated enclosure for outdoor/wet environments
   - Separate low-voltage (ESP32/5V) from high-voltage (220V) sections
   - Proper cable glands for all external connections

5. **Fusing:**
   - Main pump circuit should have 10A circuit breaker
   - 5V supply should have 2A fuse

---

## Installation Notes

1. **Test on bench first** with LEDs before connecting real loads
2. **Verify all GND connections** are common
3. **Check relay coil polarity** (some relays are polarized)
4. **Calibrate sensors** by reading known voltages
5. **Label all wires** for future maintenance
6. **Document actual contactor model numbers** for reference

---

## Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Relay clicks but contactor doesn't trigger | Parallel wiring incorrect | Check relay NO contacts in parallel with manual button |
| ESP32 resets when relay activates | Insufficient power supply | Use 2A+ power supply, add capacitor |
| Sensor always reads zero | No voltage present OR bad connection | Check sensor wiring, verify voltage with multimeter |
| Sensor reads max value constantly | Sensor input reversed | Swap sensor input terminals |
| Relay doesn't click | Transistor not switching | Check GPIO signal, transistor orientation, base resistor |
