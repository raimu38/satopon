import logging
from fastapi import Request, HTTPException, status, Depends
from jose import jwt
from src.config import AUTH_PROVIDER, SUPABASE_JWT_SECRET, FIREBASE_PROJECT_ID
from src.db import get_db

# Supabase 用
#   jose.jwt.decode

# Firebase 用
from google.oauth2 import id_token
from google.auth.transport.requests import Request as GoogleRequest

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
        external_id: str | None = None

        if AUTH_PROVIDER == "supabase":
            try:
                payload = jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    audience="authenticated"
                )
                external_id = payload.get("sub")
            except Exception as e:
                logger.error("Supabase JWT decode error: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Supabase decode error: {e}"
                )

        elif AUTH_PROVIDER == "firebase":
            try:
                id_info = id_token.verify_firebase_token(
                    token,
                    GoogleRequest(),
                    audience=FIREBASE_PROJECT_ID
                )
                # Token によっては "user_id"、または "sub" にユーザー UID が入っている
                external_id = id_info.get("user_id") or id_info.get("sub")
            except Exception as e:
                logger.error("Firebase token verify error: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid Firebase token"
                )
        else:
            logger.error("Unknown AUTH_PROVIDER: %s", AUTH_PROVIDER)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Invalid AUTH_PROVIDER setting")

        if not external_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not retrieve external_id from token"
            )

        user = await db.users.find_one({
            "external_id": external_id,
            "is_deleted": False
        })
        if not user:
            logger.warning("User not found: external_id=%s", external_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not registered"
            )

        return user["uid"]

    except HTTPException:
        # 上記で投げた HTTPException はそのまま
        raise
    except Exception as e:
        logger.error("JWT decode/verify failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"JWT verify failed: {type(e).__name__}: {e}"
        )


async def get_current_external_id(request: Request) -> str:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    token = auth.split()[1]

    if AUTH_PROVIDER == "supabase":
        try:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated"
            )
            return payload["sub"]
        except Exception as e:
            logger.error("Supabase token decode error for external_id: %s", e)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Supabase token"
            )

    elif AUTH_PROVIDER == "firebase":
        try:
            id_info = id_token.verify_firebase_token(
                token,
                GoogleRequest(),
                audience=FIREBASE_PROJECT_ID
            )
            return id_info.get("user_id") or id_info.get("sub")
        except Exception as e:
            logger.error("Firebase token verify error for external_id: %s", e)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Firebase token"
            )

    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid AUTH_PROVIDER setting"
        )

