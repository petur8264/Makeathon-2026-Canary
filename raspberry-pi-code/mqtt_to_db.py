#!/usr/bin/env python3
import json
import datetime as dt
import threading
import time
import signal
import sys

import mariadb
import paho.mqtt.client as mqtt

MQTT_HOST = "*****"
MQTT_PORT = 1883
TOPIC = "*****"

DB_HOST = "*****"
DB_PORT = 3306
DB_USER = "*****"
DB_PASS = "*****"
DB_NAME = "*****"

# requires a UNIQUE KEY on (device_id, usage_date)
UPSERT_DAILY = """
INSERT INTO daily_usage (device_id, usage_date, counter_increase, liter_count)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  counter_increase = counter_increase + VALUES(counter_increase),
  liter_count      = liter_count + VALUES(liter_count);
"""

_tls = threading.local()

def db_get_conn() -> mariadb.Connection:
    conn = getattr(_tls, "conn", None)
    if conn is None:
        conn = mariadb.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME,
            autocommit=True,  
        )
        _tls.conn = conn
    return conn

def db_upsert_daily(device_id: str, usage_date: dt.date, counter_inc: int, liters: float) -> None:
    conn = db_get_conn()
    try:
        cur = conn.cursor()
        cur.execute(UPSERT_DAILY, (device_id, usage_date, int(counter_inc), float(liters)))
        conn.commit()
        print(f"DB upsert ok: device_id={device_id} date={usage_date} inc={counter_inc} liters={liters} rowcount={cur.rowcount}")
        cur.close()
    except mariadb.Error as e:
        print(f"DB ERROR: {e!r}")
        try:
            conn.rollback()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass
        _tls.conn = None
        raise

def parse_payload(payload_bytes: bytes):
    """
    Accepts:
      - JSON object: {"device_id":"x","liters":0.25,"counter_increase":1,"ts":"2026-02-26T12:34:56"}
      - JSON number: 0.25   (liters)
      - plain number string: "0.25"
      - empty payload: treated as 1 trigger with 0 liters
    Returns: (device_id, usage_date, counter_increase, liters)
    """
    s = (payload_bytes or b"").decode("utf-8", errors="replace").strip()

    device_id = 1    
    counter_inc = 1           
    liters = 0.16               
    usage_date = dt.date.today()

    if not s:
        return device_id, usage_date, counter_inc, liters

    # try JSON first
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        # not JSON; try numeric
        try:
            liters = float(s)
            return device_id, usage_date, counter_inc, liters
        except ValueError:
            raise ValueError(f"Unparseable payload: {s!r}")

    # JSON parsed
    if isinstance(data, (int, float)):
        liters = float(data)
        return device_id, usage_date, counter_inc, liters

    if not isinstance(data, dict):
        raise ValueError(f"Unsupported JSON payload type: {type(data).__name__}")

    device_id = str(data.get("device_id", device_id))
    counter_inc = int(data.get("counter_increase", data.get("inc", counter_inc)))
    liters = float(data.get("liters", data.get("liter_count", liters)))

    ts = data.get("ts") or data.get("timestamp")
    if ts:
        try:
            t = dt.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            usage_date = t.date()
        except Exception:
            pass

    return device_id, usage_date, counter_inc, liters

def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"Connected: reason_code={reason_code}")
    client.subscribe(TOPIC, qos=1)
    print(f"Subscribed to {TOPIC}")

def on_message(client, userdata, msg):
    try:
        device_id, usage_date, counter_inc, liters = parse_payload(msg.payload)
        print(f"MQTT msg: topic={msg.topic} payload={msg.payload!r} -> device_id={device_id} date={usage_date} inc={counter_inc} liters={liters}")
        db_upsert_daily(device_id, usage_date, counter_inc, liters)
    except Exception as e:
        print(f"PROCESS ERROR: {e!r}")

def main():
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="pi-mqtt-water-reader",
        clean_session=False,
    )

    client.on_connect = on_connect
    client.on_message = on_message


    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)

    # graceful shutdown
    def _stop(*_):
        try:
            client.disconnect()
        finally:
            sys.exit(0)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    client.loop_forever(retry_first_connection=True)

if __name__ == "__main__":
    main()
