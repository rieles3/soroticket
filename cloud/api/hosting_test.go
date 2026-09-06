package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHostedConsoleKeepsAPIResponsesAndSPARoutesSeparate(t *testing.T) {
	s := testServer(t)
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>console</html>"), 0600); err != nil {
		t.Fatal(err)
	}
	handler := s.handler(dir)
	for _, tc := range []struct {
		path    string
		status  int
		content string
	}{{"/campaigns/1", 200, "console"}, {"/api/healthz", 200, `"ok":true`}, {"/readyz", 200, `"network":"testnet"`}, {"/api/v1/campaigns", 401, ""}, {"/api/missing", 404, ""}, {"/missing.js", 404, ""}} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", tc.path, nil))
		if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.content) {
			t.Fatalf("%s: %d %s", tc.path, w.Code, w.Body.String())
		}
	}
	s.db.Close()
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 503 {
		t.Fatalf("readiness after DB close = %d", w.Code)
	}
}
