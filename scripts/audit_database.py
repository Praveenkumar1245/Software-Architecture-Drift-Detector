import sqlite3
from pathlib import Path

db_path = Path("drift_detector.db")
if not db_path.exists():
    db_path = Path("backend/drift_detector.db")

print(f"Auditing Database at: {db_path.resolve()}")
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
tables = [t[0] for t in cursor.fetchall() if not t[0].startswith("sqlite_")]
print(f"Tables Found ({len(tables)}): {', '.join(tables)}")

for t in tables:
    cursor.execute(f"PRAGMA table_info({t});")
    cols = cursor.fetchall()
    col_summary = [f"{c[1]} ({c[2]}{', PK' if c[5] else ''}{', NOT NULL' if c[3] else ''})" for c in cols]
    
    cursor.execute(f"PRAGMA foreign_key_list({t});")
    fks = cursor.fetchall()
    fk_summary = [f"{fk[3]} -> {fk[2]}.{fk[4]} (on_delete={fk[6]})" for fk in fks]
    
    cursor.execute(f"PRAGMA index_list({t});")
    idxs = cursor.fetchall()
    idx_summary = [f"{idx[1]} (unique={bool(idx[2])})" for idx in idxs]
    
    cursor.execute(f"SELECT count(*) FROM {t};")
    row_count = cursor.fetchone()[0]
    
    print(f"\n--- Table: {t} [{row_count} rows] ---")
    print("  Columns:")
    for col in col_summary:
        print(f"    - {col}")
    if fk_summary:
        print("  Foreign Keys:")
        for fk in fk_summary:
            print(f"    - {fk}")
    if idx_summary:
        print("  Indexes:")
        for idx in idx_summary:
            print(f"    - {idx}")

conn.close()
print("\n[DB AUDIT COMPLETE]")
