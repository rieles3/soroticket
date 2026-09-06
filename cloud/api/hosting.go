package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// The console and API share one origin, so cookies/CSRF need no permissive CORS.
// Pages continues serving the public landing independently.
func (s *server) handler(consoleDir string) http.Handler {
	api := s.routes()
	if consoleDir == "" {
		return api
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", api))
	for _, prefix := range []string{"/v1/", "/auth/", "/orgs", "/healthz", "/readyz"} {
		mux.Handle(prefix, api)
	}
	files := http.FileServer(http.Dir(consoleDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "method not allowed", 405)
			return
		}
		clean := filepath.Clean("/" + r.URL.Path)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'")
		w.Header().Set("X-Frame-Options", "DENY")
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		info, err := os.Stat(filepath.Join(consoleDir, clean))
		if err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		if strings.Contains(filepath.Base(clean), ".") || strings.HasPrefix(clean, "/assets/") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(consoleDir, "index.html"))
	})
	return mux
}
