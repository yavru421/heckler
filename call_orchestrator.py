import urllib.request
import json

secret = 'i5wBiqnqr4bOjAd1DA4jWwbKLeJRtovJOyh8QRHzM'
guard = (
    "SYSTEM CONSTRAINTS: ZERO-FLUFF HARD ENGINEERING RULE. NEVER suggest "
    '"building a personal brand", "blogging", "posting on X/Twitter", '
    '"networking", "thought leadership", or "building/maintaining popular open source projects". '
    "Focus EXCLUSIVELY on bare-metal technical primitives: C++/CUDA/Rust kernels, "
    "local-first WASM, Zero-Liability Architecture (ZLA), DuckDB in-memory pipelines, "
    "and deterministic agent runtimes."
)

prompt = (
    guard + "\n\n"
    "Synthesize a bare-metal technical implementation plan for upgrading Heckler (heckler.dondlingergc.com) "
    "from 1.5s HTTP polling to Cloudflare Durable Objects WebSocket Hibernation API, R2 edge media streaming, "
    "and WebAudio WASM reaction synthesis."
)

payload = json.dumps({'prompt': prompt, 'task_type': 'refactor'}).encode('utf-8')
req = urllib.request.Request(
    'https://orchestrator-do.dondlingergeneralcontracting.workers.dev/chat',
    data=payload,
    headers={
        'x-orchestrator-auth': secret,
        'x-user-id': 'dev_john_desktop',
        'Content-Type': 'application/json'
    }
)

with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode('utf-8'))
    result_text = res.get('result', '')
    print(result_text)
    with open('raw_orch.txt', 'w', encoding='utf-8') as f:
        f.write(result_text)
