package soroticket

import (
	"encoding/json"
	"os"
	"testing"
)

func TestConfirmedFootprintDiagnostic(t *testing.T) {
	raw, err := os.ReadFile("testdata/footprint-conflict.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Diagnostics []string `json:"diagnostics"`
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if !hasFootprintConflict(fixture.Diagnostics) {
		t.Fatal("recorded storage footprint conflict not recognized")
	}
	if hasFootprintConflict([]string{"invalid xdr"}) || hasFootprintConflict(nil) {
		t.Fatal("invalid diagnostics must not authorize a new submission")
	}
}
