from bottle import Bottle, request, response, run
import mysql.connector
from decimal import Decimal
import json

app = Bottle()

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="wateruser",
        password="water",
        database="water_monitor"
    )

@app.hook('after_request')
def enable_cors():
    response.headers['Access-Control-Allow-Origin'] = '*'  # allow all domains
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Origin, Accept, Content-Type, X-Requested-With'

@app.route('/<:re:.*>', method='OPTIONS')
def options_handler():
        return

@app.post("/api/update")
def update_usage():
    data = request.json
    if not data or "activations" not in data or "liters" not in data:
        response.status = 400
        return {"error": "Missing activations or liters in JSON"}

    esp_activations = int(data["activations"])
    esp_liters = float(data["liters"])

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE daily_usage
            SET counter_increase = counter_increase + %s,
                liter_count = liter_count + %s
            WHERE device_id = 1 AND usage_date = CURDATE()
        """, (esp_activations, esp_liters))

        if cursor.rowcount == 0:
            cursor.execute("""
                INSERT INTO daily_usage (device_id, usage_date, counter_increase, liter_count)
                VALUES (1, CURDATE(), %s, %s)
            """, (esp_activations, esp_liters))

        conn.commit()
        cursor.close()
    finally:
        conn.close()

    return {"status": "success", "added_activations": esp_activations, "added_liters": esp_liters}

@app.get("/api/today")
def get_today():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(buffered=True, dictionary=True)
        cursor.execute("""
            SELECT counter_increase AS total_activations,
                   liter_count AS total_liters
            FROM daily_usage
            WHERE device_id = 1 AND usage_date = CURDATE()
        """)
        result = cursor.fetchone()
        cursor.close()
    finally:
        conn.close()

    response.content_type = 'application/json'
    return result or {"total_activations": 0, "total_liters": 0}
@app.get("/api/history")
def get_history():
    conn = get_db_connection()
    cursor = None
    try:
        cursor = conn.cursor(buffered=True, dictionary=True)
        cursor.execute("""
            SELECT
                DATE_FORMAT(usage_date, '%Y-%m-%d') AS usage_date,
                total_activations,
                total_liters
            FROM historical_usage
            WHERE device_id = 1
            ORDER BY usage_date DESC
            LIMIT 7
        """)
        rows = cursor.fetchall()
    finally:
        if cursor:
            cursor.close()
        conn.close()

    out = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("total_liters"), Decimal):
            d["total_liters"] = float(d["total_liters"])
        out.append(d)

    response.content_type = "application/json"
    return json.dumps(out)

@app.get("/api/summary")
def get_summary():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(buffered=True, dictionary=True)
        cursor.execute("""
            SELECT SUM(total_activations) AS total_activations,
                   SUM(total_liters) AS total_liters
            FROM historical_usage
            WHERE device_id = 1
        """)
        historical = cursor.fetchone()

        cursor.execute("""
            SELECT counter_increase AS today_activations,
                   liter_count AS today_liters
            FROM daily_usage
            WHERE device_id = 1 AND usage_date = CURDATE()
        """)
        today = cursor.fetchone()

        cursor.close()
    finally:
        conn.close()

    total_activations = (historical["total_activations"] or 0) + (today["today_activations"] or 0)
    total_liters = (historical["total_liters"] or 0) + (today["today_liters"] or 0)

    response.content_type = 'application/json'
    return {"total_activations": total_activations, "total_liters": total_liters}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, server="paste", debug=True)
