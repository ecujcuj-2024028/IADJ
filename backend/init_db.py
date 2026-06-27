import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "youtube_music_dj"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASS", "postgres"),
    "port": os.getenv("DB_PORT", "5432")
}

def init_db():
    try:
        # Primero intentamos conectar a postgres para crear la base de datos si no existe
        conn = psycopg2.connect(
            host=DB_CONFIG["host"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            port=DB_CONFIG["port"],
            database="postgres"
        )
        conn.autocommit = True
        cur = conn.cursor()
        
        # Verificar si la base de datos existe
        cur.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{DB_CONFIG['database']}';")
        exists = cur.fetchone()
        if not exists:
            cur.execute(f"CREATE DATABASE {DB_CONFIG['database']};")
            print(f"✅ Base de datos '{DB_CONFIG['database']}' creada.")
        
        cur.close()
        conn.close()

        # Ahora conectamos a la base de datos específica para crear la tabla
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_tokens (
                email TEXT PRIMARY KEY,
                access_token TEXT,
                refresh_token TEXT,
                expires_at TIMESTAMP,
                auth_data JSONB
            );
        """)
        conn.commit()
        print("✅ Tabla 'user_tokens' lista.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Error configurando la base de datos: {e}")

if __name__ == "__main__":
    init_db()
