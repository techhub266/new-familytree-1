import os
import sqlite3
from flask import Flask, render_template, request, jsonify, send_file
import io
import json

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), "family_tree.db")
SQL_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "database.sql")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(load_sample_if_empty=True):
    conn = get_db()
    cursor = conn.cursor()
    
    # Create members table if not exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female', 'Other')),
        relation TEXT NOT NULL,
        dob TEXT,
        dod TEXT,
        alive INTEGER DEFAULT 1,
        related_id INTEGER,
        photo_url TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (related_id) REFERENCES members(id) ON DELETE SET NULL
    );
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_members_related_id ON members(related_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_members_relation ON members(relation);")
    conn.commit()

    # Check if empty, load sample data
    cursor.execute("SELECT COUNT(*) as count FROM members")
    count = cursor.fetchone()["count"]
    
    if count == 0 and load_sample_if_empty:
        if os.path.exists(SQL_SCHEMA_PATH):
            with open(SQL_SCHEMA_PATH, "r", encoding="utf-8") as f:
                schema_sql = f.read()
                try:
                    cursor.executescript(schema_sql)
                    conn.commit()
                except Exception as e:
                    print(f"Error loading initial sample data: {e}")

    conn.close()

# Initialize DB on startup
init_db(load_sample_if_empty=True)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/members", methods=["GET"])
def get_members():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM members ORDER BY id ASC")
    rows = cursor.fetchall()
    members = [dict(row) for row in rows]
    conn.close()
    return jsonify({"success": True, "members": members})

@app.route("/api/members/<int:member_id>", methods=["GET"])
def get_member(member_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM members WHERE id = ?", (member_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({"success": False, "message": "Member not found"}), 404
    return jsonify({"success": True, "member": dict(row)})

@app.route("/api/members", methods=["POST"])
def add_member():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    gender = data.get("gender") or "Male"
    relation = (data.get("relation") or "Member").strip()
    dob = (data.get("dob") or "").strip()
    dod = (data.get("dod") or "").strip()
    alive = int(data.get("alive", 1))
    related_id = data.get("related_id")
    photo_url = (data.get("photo_url") or "").strip()
    bio = (data.get("bio") or "").strip()

    if not name:
        return jsonify({"success": False, "message": "Name is required"}), 400

    if related_id in ("", None, "null"):
        related_id = None
    else:
        try:
            related_id = int(related_id)
        except (ValueError, TypeError):
            related_id = None

    conn = get_db()
    cursor = conn.cursor()

    # Smart link processing:
    if related_id is not None:
        cursor.execute("SELECT * FROM members WHERE id = ?", (related_id,))
        related_row = cursor.fetchone()

        if related_row:
            rel_lower = relation.lower().strip()
            
            # If adding Son-in-law and related person is parent with a daughter, auto-link to daughter
            if rel_lower in ("son-in-law", "son in law"):
                if related_row["relation"].lower() == "daughter" or related_row["gender"] == "Female":
                    related_id = related_row["id"]
                else:
                    cursor.execute("""
                        SELECT id FROM members 
                        WHERE related_id = ? AND (LOWER(relation) = 'daughter' OR gender = 'Female')
                        LIMIT 1
                    """, (related_id,))
                    d_row = cursor.fetchone()
                    if d_row:
                        related_id = d_row["id"]

            # If adding Daughter-in-law and related person is parent with a son, auto-link to son
            elif rel_lower in ("daughter-in-law", "daughter in law"):
                if related_row["relation"].lower() == "son" or related_row["gender"] == "Male":
                    related_id = related_row["id"]
                else:
                    cursor.execute("""
                        SELECT id FROM members 
                        WHERE related_id = ? AND (LOWER(relation) = 'son' OR gender = 'Male')
                        LIMIT 1
                    """, (related_id,))
                    s_row = cursor.fetchone()
                    if s_row:
                        related_id = s_row["id"]

            # If adding Brother or Sister, connect to the same parent
            elif rel_lower in ("brother", "sister"):
                if related_row["related_id"] is not None:
                    related_id = related_row["related_id"]

    cursor.execute("""
        INSERT INTO members (name, gender, relation, dob, dod, alive, related_id, photo_url, bio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (name, gender, relation, dob, dod, alive, related_id, photo_url, bio))
    
    new_id = cursor.lastrowid

    # If adding Father or Mother to an existing root person who had no parent:
    if relation in ("Father", "Mother") and related_id is not None:
        cursor.execute("SELECT related_id FROM members WHERE id = ?", (related_id,))
        child_row = cursor.fetchone()
        if child_row and child_row["related_id"] is None:
            cursor.execute("UPDATE members SET related_id = ? WHERE id = ?", (new_id, related_id))
            cursor.execute("UPDATE members SET related_id = NULL WHERE id = ?", (new_id,))

    conn.commit()

    cursor.execute("SELECT * FROM members WHERE id = ?", (new_id,))
    new_member = dict(cursor.fetchone())
    conn.close()

    return jsonify({"success": True, "member": new_member, "message": "Member added successfully"}), 201

@app.route("/api/members/<int:member_id>", methods=["PUT"])
def update_member(member_id):
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    gender = data.get("gender") or "Male"
    relation = (data.get("relation") or "Member").strip()
    dob = (data.get("dob") or "").strip()
    dod = (data.get("dod") or "").strip()
    alive = int(data.get("alive", 1))
    related_id = data.get("related_id")
    photo_url = (data.get("photo_url") or "").strip()
    bio = (data.get("bio") or "").strip()

    if not name:
        return jsonify({"success": False, "message": "Name is required"}), 400

    if related_id in ("", None, "null"):
        related_id = None
    else:
        try:
            related_id = int(related_id)
            if related_id == member_id:
                related_id = None  # Cannot relate to oneself
        except (ValueError, TypeError):
            related_id = None

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE members 
        SET name = ?, gender = ?, relation = ?, dob = ?, dod = ?, alive = ?, related_id = ?, photo_url = ?, bio = ?
        WHERE id = ?
    """, (name, gender, relation, dob, dod, alive, related_id, photo_url, bio, member_id))
    conn.commit()

    cursor.execute("SELECT * FROM members WHERE id = ?", (member_id,))
    updated = cursor.fetchone()
    conn.close()

    if not updated:
        return jsonify({"success": False, "message": "Member not found"}), 404

    return jsonify({"success": True, "member": dict(updated), "message": "Member updated successfully"})

@app.route("/api/members/<int:member_id>", methods=["DELETE"])
def delete_member(member_id):
    conn = get_db()
    cursor = conn.cursor()
    
    # Delete member
    cursor.execute("DELETE FROM members WHERE id = ?", (member_id,))
    
    # Set related_id to NULL for any children/spouses referencing deleted member
    cursor.execute("UPDATE members SET related_id = NULL WHERE related_id = ?", (member_id,))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Member deleted successfully"})

@app.route("/api/clear", methods=["POST"])
def clear_tree():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM members")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='members'")
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Family tree cleared successfully"})

@app.route("/api/reset-sample", methods=["POST"])
def reset_sample():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM members")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='members'")
    conn.commit()

    if os.path.exists(SQL_SCHEMA_PATH):
        with open(SQL_SCHEMA_PATH, "r", encoding="utf-8") as f:
            schema_sql = f.read()
            cursor.executescript(schema_sql)
            conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Sample family tree loaded successfully"})

@app.route("/api/stats", methods=["GET"])
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as total FROM members")
    total = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as males FROM members WHERE gender = 'Male'")
    males = cursor.fetchone()["males"]

    cursor.execute("SELECT COUNT(*) as females FROM members WHERE gender = 'Female'")
    females = cursor.fetchone()["females"]

    cursor.execute("SELECT COUNT(*) as living FROM members WHERE alive = 1")
    living = cursor.fetchone()["living"]

    cursor.execute("""
        SELECT COUNT(*) as in_laws FROM members 
        WHERE LOWER(relation) IN ('son-in-law', 'son in law', 'daughter-in-law', 'daughter in law')
    """)
    in_laws = cursor.fetchone()["in_laws"]

    conn.close()
    return jsonify({
        "success": True,
        "stats": {
            "total": total,
            "males": males,
            "females": females,
            "living": living,
            "deceased": total - living,
            "in_laws": in_laws
        }
    })

@app.route("/api/export", methods=["GET"])
def export_tree():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM members ORDER BY id ASC")
    rows = cursor.fetchall()
    members = [dict(row) for row in rows]
    conn.close()

    json_str = json.dumps(members, indent=2)
    mem_file = io.BytesIO()
    mem_file.write(json_str.encode("utf-8"))
    mem_file.seek(0)
    return send_file(mem_file, as_attachment=True, download_name="family_tree_backup.json", mimetype="application/json")

@app.route("/api/import", methods=["POST"])
def import_tree():
    data = request.get_json() or []
    if not isinstance(data, list):
        return jsonify({"success": False, "message": "Invalid JSON format. Expected list of members."}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM members")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='members'")

    for m in data:
        cursor.execute("""
            INSERT INTO members (id, name, gender, relation, dob, dod, alive, related_id, photo_url, bio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            m.get("id"),
            m.get("name", "Unknown"),
            m.get("gender", "Male"),
            m.get("relation", "Member"),
            m.get("dob", ""),
            m.get("dod", ""),
            m.get("alive", 1),
            m.get("related_id"),
            m.get("photo_url", ""),
            m.get("bio", "")
        ))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"Successfully imported {len(data)} members."})

if __name__ == "__main__":
    print("Starting Family Tree Server on http://127.0.0.1:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
