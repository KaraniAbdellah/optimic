import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from jose import JWTError, jwt

load_dotenv(".env")

SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-12345")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
TOKEN_EXPIRE_DAYS = int(os.getenv("TOKEN_EXPIRE_DAYS", 7))
AUTH_DB = "auth.db"
CHATS_DB = "chats.db"


# def init_auth_db():
#     with sqlite3.connect(AUTH_DB) as conn:
#         conn.execute("""
#             CREATE TABLE IF NOT EXISTS users (
#                 uid TEXT PRIMARY KEY,
#                 email TEXT UNIQUE,
#                 name TEXT
#             )
#         """)


# init_auth_db()


def find_user_by_email(email: str):
    with sqlite3.connect(AUTH_DB) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()
        return dict(row) if row else None


def create_user(email: str, name: str) -> dict:
    user = {
        "uid": str(uuid.uuid4()),
        "email": email,
        "name": name,
    }
    with sqlite3.connect(AUTH_DB) as conn:
        conn.execute(
            "INSERT INTO users (uid, email, name) VALUES (?, ?, ?)",
            (user["uid"], user["email"], user["name"]),
        )
    return user


def get_or_create_user(email: str, name: str) -> dict:
    user = find_user_by_email(email)
    if user is None:
        user = create_user(email, name)
    return user


def create_token(user: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {
        "uid": user["uid"],
        "email": user["email"],
        "name": user["name"],
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise ValueError("Invalid or expired token")

    uid = payload.get("uid")
    email = payload.get("email")
    name = payload.get("name")

    if not uid or not email or not name:
        raise ValueError("Invalid token payload")

    with sqlite3.connect(AUTH_DB) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
        user = dict(row) if row else None

    if not user:
        raise ValueError("User not found in system")

    if user["email"] != email or user["name"] != name:
        raise ValueError("Authentication data mismatch")

    return user


def delete_user(uid: str):
    with sqlite3.connect(AUTH_DB) as conn:
        conn.execute("DELETE FROM users WHERE uid = ?", (uid,))


def delete_user_from_auth_db(user_uid: str):
    with sqlite3.connect(AUTH_DB) as conn:
        conn.execute("DELETE FROM users WHERE uid = ?", (user_uid,))


def get_user_datasets(user_uid: str):
    with sqlite3.connect(CHATS_DB) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT dataset_id FROM datasets WHERE user_uid = ?", (user_uid,)
        ).fetchall()
        return [row["dataset_id"] for row in rows]