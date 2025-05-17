import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()

print("SUPABASE_URL:", os.environ.get("SUPABASE_URL"))
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SUPABASE_TABLE = os.environ["SUPABASE_TABLE"]

app = FastAPI()

class TodoItem(BaseModel):
    title: str
    description: str = ""

@app.post("/todos")
async def create_todo(item: TodoItem):
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    data = item.dict()
    print("Request URL:", url)
    print("Request Headers:", headers)
    print("Request Body:", data)
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=data)
        print("Response status_code:", response.status_code)
        print("Response text:", response.text)
        if response.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=response.text)
        return response.json()
