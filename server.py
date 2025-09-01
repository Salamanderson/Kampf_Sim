# server.py — minimaler Static-Server mit korrekten Headern für WASM/CORS/COOP/COEP
# Run: python server.py  (öffnet http://localhost:8000)
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes, webbrowser

PORT = 8000

class Handler(SimpleHTTPRequestHandler):
    # Korrekte MIME für .wasm sicherstellen
    if ('.wasm', 'application/wasm') not in mimetypes.types_map.items():
        mimetypes.add_type('application/wasm', '.wasm')

    def end_headers(self):
        # Cross-Origin Isolation, falls du später Pyodide mit Threads brauchst
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")

        # CORS für statische Dateien (macht das Nachladen einfacher)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

        # Sichere MIME-Fallbacks
        if self.path.endswith(".wasm"):
            self.send_header("Content-Type", "application/wasm")
        return super().end_headers()

    # Optional: saubere OPTIONS-Antwort für CORS
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("localhost", PORT), Handler)
    url = f"http://localhost:{PORT}/index.html"
    print(f"Serving on {url}")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    srv.serve_forever()
