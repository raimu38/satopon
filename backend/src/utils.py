import logging
from fastapi import Request, HTTPException, status, Depends
from jose import jwt
from src.config import AUTH_PROVIDER, SUPABASE_JWT_SECRET, FIREBASE_PROJECT_ID
from src.db import get_db

logger = logging.getLogger(__name__)

async def get_current_uid(
    request: Request,
    db=Depends(get_db)
) -> str:
    auth = request.headers.get("Authorization")
    logger.debug(f"Authorization header: {auth}")
    if not auth or not auth.startswith("Bearer "):
        logger.warning("Authorization header missing or invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    token = auth.split()[1]
    try:
        # --- JWTからexternal_idを取得 ---
        if AUTH_PROVIDER == "supabase":
            try:
                payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
            except Exception as e:
                logger.error("supabase decode error: %s", e)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"supabase decode error: {e}")
            external_id = payload["sub"]

        elif AUTH_PROVIDER == "firebase":
            from google.auth.transport import requests
            from google.oauth2 import id_token
            id_info = id_token.verify_oauth2_token(token, requests.Request(), FIREBASE_PROJECT_ID)
            external_id = id_info["uid"]
        else:
            logger.error(f"Unknown AUTH_PROVIDER: {AUTH_PROVIDER}")
            raise HTTPException(status_code=500, detail="Invalid AUTH_PROVIDER setting")

        # --- DBからexternal_id→uidを逆引き ---
        user = await db.users.find_one({"external_id": external_id, "is_deleted": False})
        if not user:
            logger.warning(f"User with external_id={external_id} not found")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not registered")
        return user["uid"]

    except Exception as e:
        logger.error(f"JWT decode/verify failed: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"JWT verify failed: {type(e).__name__}: {e}")

async def get_current_external_id(request: Request) -> str:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    token = auth.split()[1]
    # Supabase例
    payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    return payload["sub"]

