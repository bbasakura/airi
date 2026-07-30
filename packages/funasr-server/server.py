import os
import re
import json
import tempfile
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

MODEL_ID = "iic/SenseVoiceSmall"
MODEL_LOCAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hf-models")
model = None

def get_model():
    global model
    if model is None:
        print("[FunASR] Loading SenseVoiceSmall model...", flush=True)
        from funasr import AutoModel
        # Use local path if available, otherwise download
        model_path = MODEL_LOCAL_PATH if os.path.isdir(MODEL_LOCAL_PATH) else MODEL_ID
        print(f"[FunASR] Model path: {model_path}", flush=True)
        model = AutoModel(
            model=model_path,
            disable_update=True,
            device="cpu",
        )
        print("[FunASR] Model loaded!", flush=True)
    return model

def transcribe_audio(audio_path, language="zh"):
    m = get_model()
    result = m.generate(
        input=audio_path,
        cache={},
        language=language,
        use_itn=True,
        batch_size_s=60,
    )
    if result and len(result) > 0:
        text = result[0].get("text", "")
        text = re.sub(r"<\|[^|]+\|>", "", text).strip()
        return text
    return ""

def parse_multipart_body(body_bytes, content_type):
    boundary_match = re.search(r"boundary=([^\s;]+)", content_type)
    if not boundary_match:
        return {}
    boundary = boundary_match.group(1).strip('"')
    delimiter = ("--" + boundary).encode()
    result = {}
    parts = body_bytes.split(delimiter)
    for part in parts:
        if not part or part in (b"\r\n", b"--\r\n") or part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        if b"\r\n\r\n" in part:
            headers_raw, body = part.split(b"\r\n\r\n", 1)
        elif b"\n\n" in part:
            headers_raw, body = part.split(b"\n\n", 1)
        else:
            continue
        headers_text = headers_raw.decode("utf-8", errors="replace")
        d_match = re.search(r'Content-Disposition:[^\r\n]*name="([^"]+)"', headers_text, re.IGNORECASE)
        if not d_match:
            continue
        field_name = d_match.group(1)
        fn_match = re.search(r'filename="([^"]+)"', headers_text, re.IGNORECASE)
        if fn_match:
            result[field_name] = {"filename": fn_match.group(1), "data": body}
        else:
            result[field_name] = body.decode("utf-8", errors="replace").strip()
    return result

class TranscriptionHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[HTTP] {fmt % args}", flush=True)

    def do_GET(self):
        body = json.dumps({"status": "ok", "model": MODEL_ID}).encode()
        self._respond(200, body, "application/json")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/v1/audio/transcriptions":
            self.send_error(404)
            return
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", 0))
        tmp_path = None
        try:
            body_bytes = self.rfile.read(content_length)
            fields = parse_multipart_body(body_bytes, content_type)
            language = fields.get("language", "zh")
            if isinstance(language, dict):
                language = "zh"
            if "file" not in fields:
                self._json_error(400, "Missing file")
                return
            audio_info = fields["file"]
            audio_data = audio_info["data"]
            filename = audio_info.get("filename", "audio.wav")
            suffix = os.path.splitext(filename)[1] or ".wav"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
                tf.write(audio_data)
                tmp_path = tf.name
            print(f"[FunASR] Transcribing {tmp_path} size={len(audio_data)} lang={language}", flush=True)
            text = transcribe_audio(tmp_path, language=language)
            print(f"[FunASR] Result: {text!r}", flush=True)
            body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
            self._respond(200, body, "application/json; charset=utf-8")
        except Exception as e:
            traceback.print_exc()
            self._json_error(500, str(e))
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    def _respond(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code, message):
        body = json.dumps({"error": {"message": message}}).encode()
        self._respond(code, body, "application/json")

def preload_model():
    try:
        get_model()
    except Exception as e:
        print(f"[FunASR] Model preload failed: {e}", flush=True)
        traceback.print_exc()

if __name__ == "__main__":
    PORT = int(os.environ.get("FUNASR_PORT", "17494"))
    HOST = os.environ.get("FUNASR_HOST", "127.0.0.1")
    print(f"[FunASR] SenseVoice STT -> http://{HOST}:{PORT}", flush=True)
    preload_model()
    server = HTTPServer((HOST, PORT), TranscriptionHandler)
    print("[FunASR] Ready!", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
