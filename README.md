# Water Waste Monitor

A fully self-hosted water usage monitoring system built on a Raspberry Pi. The system tracks sink activity using an ESP32 with an ultrasonic sensor, integrates with industrial water equipment from Lorenz, and provides a local web interface for monitoring daily usage.

> **All components run locally on the network. No cloud services are required.**

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Hardware Layer](#hardware-layer)
- [Communication Layer](#communication-layer)
- [Backend Layer](#backend-layer)
- [Database Layer](#database-layer)
- [Frontend Layer](#frontend-layer)
- [Data Flow Summary](#data-flow-summary)
- [Design Principles](#design-principles)

---

## Overview

The system is designed to measure water usage events, store them efficiently, and provide a live dashboard. Instead of measuring flow directly, it detects sink activity using distance measurements from an ultrasonic sensor mounted near the faucet. Each activation generates a 30-second usage event, which is sent to the Raspberry Pi via MQTT.

Industrial water handling and pumping equipment from Lorenz provides the physical movement of water. The monitoring system is layered on top of this infrastructure, providing visibility and usage analytics without interfering with existing plumbing or pumps.

---

## System Architecture

```
ESP32 + Ultrasonic Sensor
         ↓ (MQTT)
    Raspberry Pi
         ↓
    Mosquitto Broker
         ↓
    Bottle Backend API
         ↓
    MariaDB Database
         ↓
    Nginx Web Server
         ↓
    Browser (JS Fetch)
```

This diagram represents the complete flow from physical water usage to web dashboard visualization.

---

## Hardware Layer

### ESP32
- Reads sensor data and publishes MQTT messages
- Connects to Wi-Fi
- Low-power and reliable for IoT usage

### Ultrasonic Sensor
- Mounted near the faucet in a 3D-printed enclosure
- Detects sink activity
- Triggers 30-second activation windows

### 3D-Printed Enclosure
- Aligns the sensor accurately
- Protects sensor from environmental factors
- Integrates cleanly with the faucet

### Lorenz Equipment
- Pumps and water control systems
- Monitored passively by the ESP32 + sensor system
- Ensures industrial-grade water handling

---

## Communication Layer

| Property | Value |
|----------|-------|
| Protocol | MQTT |
| Broker | Mosquitto on the Raspberry Pi |
| Topic Example | `water/sink/activation` |

MQTT ensures reliable, low-latency delivery of events from the ESP32 to the Raspberry Pi.

---

## Backend Layer

- **Platform:** Raspberry Pi
- **Framework:** Bottle (Python)

**Responsibilities:**
- Subscribe to MQTT events
- Aggregate 30-second activation events
- Store usage in MariaDB
- Expose API endpoints

### Example API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/today` | Current day usage |
| `/api/daily` | Historical daily usage |
| `/api/summary` | Aggregated usage over time |

---

## Database Layer

MariaDB stores usage data.

**Table: `daily_usage`**

```sql
CREATE TABLE daily_usage (
    device_id        VARCHAR(50) NOT NULL,
    usage_date       DATE        NOT NULL,
    counter_increase FLOAT       NOT NULL,
    PRIMARY KEY (device_id, usage_date)
);
```

- Each device is tracked individually
- Daily counters accumulate activation events and estimated liters used

---

## Frontend Layer

- **Built with:** HTML, CSS, JavaScript
- **Function:** Dynamically fetch data from the Bottle API and render a dashboard

```javascript
fetch("/api/today")
  .then(res => res.json())
  .then(data => updateDashboard(data));
```

- Lightweight and framework-free
- Updates the dashboard in near real-time

---

## Data Flow Summary

```
1. Sink activates → ultrasonic sensor detects presence
2. ESP32 publishes a 30-second activation event via MQTT
3. Raspberry Pi receives the event
4. Bottle backend processes the event and aggregates data
5. MariaDB updates daily usage counters
6. Frontend queries the API and updates the dashboard
```

---

## Design Principles

| Principle | Description |
|-----------|-------------|
| **Local-first architecture** | All processing and storage occur on the Raspberry Pi |
| **Hardware-software integration** | ESP32, Lorenz equipment, and backend work together seamlessly |
| **Transparency** | Every layer is simple, readable, and maintainable |
| **Efficiency** | Minimal overhead for data collection, storage, and visualization |
