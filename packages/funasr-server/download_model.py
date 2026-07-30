import requests
import os

hf_base = "https://hf-mirror.com"
repo = "FunAudioLLM/SenseVoiceSmall"
dest = r"D:\soft\Erii\packages\funasr-server\hf-models"

# Key files needed for inference (skip images, examples)
needed = [
    "model.pt",
    "config.yaml",
    "configuration.json",
    "am.mvn",
    "chn_jpn_yue_eng_ko_spectok.bpe.model",
    "requirements.txt",
]

for fname in needed:
    out_path = os.path.join(dest, fname)
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        print(f"[skip] {fname} already exists ({os.path.getsize(out_path)} bytes)")
        continue
    url = f"{hf_base}/{repo}/resolve/main/{fname}"
    print(f"[download] {fname} ...", end=" ", flush=True)
    try:
        r = requests.get(url, stream=True, timeout=300)
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0))
        downloaded = 0
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(65536):
                f.write(chunk)
                downloaded += len(chunk)
        print(f"OK ({downloaded // 1024 // 1024} MB)")
    except Exception as e:
        print(f"FAILED: {e}")

print("Done!")
