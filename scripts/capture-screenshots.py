import asyncio
import os
import json
import urllib.request
import urllib.parse
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:5000"
OUTPUT_DIR = "client/public/screenshots"

PAGES_AFTER_LOGIN = [
    {"name": "03-dashboard", "path": "/dashboard", "wait": 3000},
    {"name": "04-analytics", "path": "/analytics", "wait": 3000},
    {"name": "05-social-media", "path": "/social-media", "wait": 3000},
    {"name": "06-marketplace", "path": "/marketplace", "wait": 3000},
    {"name": "07-distribution", "path": "/distribution", "wait": 3000},
    {"name": "08-studio", "path": "/studio", "wait": 3000},
    {"name": "09-advertising", "path": "/advertising", "wait": 3000},
    {"name": "10-royalties", "path": "/royalties", "wait": 3000},
    {"name": "11-collaborations", "path": "/collaborations", "wait": 3000},
    {"name": "12-career-coach", "path": "/career-coach", "wait": 3000},
    {"name": "13-settings", "path": "/settings", "wait": 3000},
    {"name": "14-projects", "path": "/projects", "wait": 3000},
    {"name": "15-pricing", "path": "/pricing", "wait": 2000},
]

def get_demo_session_cookie():
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/demo",
        data=b'{}',
        headers={
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https'
        },
        method='POST'
    )
    response = urllib.request.urlopen(req)
    cookies = response.headers.get_all('Set-Cookie')
    for cookie in cookies:
        if cookie.startswith('sessionId='):
            value = cookie.split(';')[0].split('=', 1)[1]
            return urllib.parse.unquote(value)
    return None

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("Getting demo session cookie via API...")
    session_cookie_value = get_demo_session_cookie()
    if not session_cookie_value:
        print("ERROR: Could not get session cookie!")
        return
    print(f"   Got session cookie: {session_cookie_value[:20]}...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            executable_path="/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
            chromium_sandbox=False,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
            extra_http_headers={"X-Forwarded-Proto": "https"},
            ignore_https_errors=True,
        )
        
        await context.add_cookies([{
            "name": "sessionId",
            "value": session_cookie_value,
            "domain": "localhost",
            "path": "/",
            "httpOnly": True,
            "secure": False,
            "sameSite": "Lax"
        }])
        
        page = await context.new_page()
        
        print("\n--- Public Pages ---")
        
        print("1. Landing page...")
        await page.goto(f"{BASE_URL}/", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)
        try:
            cookie_btn = page.get_by_role("button", name="Accept cookies")
            if await cookie_btn.is_visible(timeout=2000):
                await cookie_btn.click()
                await page.wait_for_timeout(500)
        except:
            pass
        await page.screenshot(path=f"{OUTPUT_DIR}/01-landing.png", full_page=False)
        print("   Saved: 01-landing.png")
        
        print("2. Full landing page...")
        await page.screenshot(path=f"{OUTPUT_DIR}/00-landing-full.png", full_page=True)
        print("   Saved: 00-landing-full.png")
        
        print("3. Login page...")
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{OUTPUT_DIR}/02-login.png", full_page=False)
        print("   Saved: 02-login.png")
        
        print("\n--- Authenticated Pages (Demo Mode) ---")
        
        print("   Verifying auth...")
        await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        print(f"   Current URL: {page.url}")
        
        if "/login" in page.url:
            print("   Session not working, trying direct API login in page context...")
            await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1000)
            
            await page.evaluate("""
                async () => {
                    const res = await fetch('/api/auth/demo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (data.id) {
                        localStorage.setItem('demo-user', JSON.stringify(data));
                    }
                    return data;
                }
            """)
            await page.wait_for_timeout(2000)
            await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(3000)
            print(f"   URL after re-login: {page.url}")
        
        for pg in PAGES_AFTER_LOGIN:
            name = pg["name"]
            path = pg["path"]
            wait = pg["wait"]
            
            print(f"4. {name} ({path})...")
            try:
                await page.goto(f"{BASE_URL}{path}", wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(wait)
                await page.screenshot(path=f"{OUTPUT_DIR}/{name}.png", full_page=False)
                print(f"   Saved: {name}.png")
            except Exception as e:
                print(f"   Error: {e}")
                try:
                    await page.screenshot(path=f"{OUTPUT_DIR}/{name}.png", full_page=False)
                    print(f"   Saved anyway: {name}.png")
                except:
                    print(f"   Skipped")
        
        await browser.close()
        
        files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.png')])
        print(f"\nDone! {len(files)} screenshots saved:")
        for f in files:
            size = os.path.getsize(f"{OUTPUT_DIR}/{f}")
            print(f"  {f} ({size//1024}KB)")

asyncio.run(main())
