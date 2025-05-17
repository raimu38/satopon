import httpx

NTFY_TOPIC = "satopon_notify"  # スマホ側で購読しているトピック名
NTFY_URL = f"https://ntfy.sh/{NTFY_TOPIC}"

async def send_ntfy_notification(message: str):
    async with httpx.AsyncClient() as client:
        resp = await client.post(NTFY_URL, data=message.encode('utf-8'))
        return resp.status_code

