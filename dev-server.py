"""Tiny no-cache static server for developing/testing PhotoEditor (the app itself needs no server)."""
import http.server, sys, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache'); self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f'PhotoEditor dev server on http://127.0.0.1:{port}', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
