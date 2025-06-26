import os

from dotenv import load_dotenv
load_dotenv()  # .envファイルを自動で読み込む

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://satopon_mongo:27017")
REDIS_URI = os.getenv("REDIS_URI", "redis://satopon_redis:6379/0")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "satopon")
JWT_SECRET = os.getenv("JWT_SECRET", "satopon-secret")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")

# 認証プロバイダ種別（supabase or firebase）
AUTH_PROVIDER = os.getenv("AUTH_PROVIDER", "supabase")

# 各プロバイダ個別の秘密鍵や設定も追加
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", None)
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", None)

# 例: どちらも存在しない場合はエラー出すなど、ここで制御できる
if AUTH_PROVIDER == "supabase" and not SUPABASE_JWT_SECRET:
    raise RuntimeError("SUPABASE_JWT_SECRET is required for Supabase auth")
if AUTH_PROVIDER == "firebase" and not FIREBASE_PROJECT_ID:
    raise RuntimeError("FIREBASE_PROJECT_ID is required for Firebase auth")
