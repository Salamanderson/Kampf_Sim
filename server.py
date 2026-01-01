# server.py — No-Cache Server mit CORS/COOP/COEP Headers
# Run: python server.py  (öffnet http://localhost:8000)
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes, webbrowser, sys
import socketserver

PORT = 8000

class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    # Korrekte MIME für .wasm sicherstellen
    if ('.wasm', 'application/wasm') not in mimetypes.types_map.items():
        mimetypes.add_type('application/wasm', '.wasm')

    def end_headers(self):
        # NO-CACHE: Diese Header zwingen den Browser, immer die neuste Datei zu laden
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

        # Cross-Origin Isolation, falls du später Pyodide mit Threads brauchst
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")

        # CORS für statische Dateien
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

        # Sichere MIME-Fallbacks
        if self.path.endswith(".wasm"):
            self.send_header("Content-Type", "application/wasm")

        return super().end_headers()

    # Saubere OPTIONS-Antwort für CORS
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

# Erlaubt schnelles Neustarten des Ports (Address already in use fix)
socketserver.TCPServer.allow_reuse_address = True

if __name__ == "__main__":
    print(f"Server läuft auf http://localhost:{PORT}")
    print("Cache-Control: DISABLED (immer frische Dateien)")
    print("Drücke Strg+C zum Beenden.")

    srv = ThreadingHTTPServer(("localhost", PORT), NoCacheHTTPRequestHandler)
    url = f"http://localhost:{PORT}/index.html"

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nServer gestoppt.")
        sys.exit(0)
