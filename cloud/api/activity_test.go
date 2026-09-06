package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
)

func TestActivityFiltersBeforeLimitAndPaginatesWithinTenant(t *testing.T) {
	s := testServer(t)
	for i := 0; i < 125; i++ {
		campaign := int64(2)
		if i < 5 {
			campaign = 1
		}
		if _, err := s.db.Exec(`INSERT INTO activity(org_id,env,ts,kind,message,campaign_id) VALUES(7,'test',?,'event','recorded',?)`, i, campaign); err != nil {
			t.Fatal(err)
		}
	}
	_, err := s.db.Exec(`INSERT INTO activity(org_id,env,ts,kind,message,campaign_id) VALUES(8,'test',999,'event','foreign',1),(7,'live',999,'event','other env',1)`)
	if err != nil {
		t.Fatal(err)
	}
	cursor := int64(0)
	seen := map[int64]bool{}
	for {
		path := "/v1/activity?campaign_id=1&limit=2"
		if cursor > 0 {
			path += fmt.Sprintf("&cursor=%d", cursor)
		}
		w := httptest.NewRecorder()
		s.handleActivity(w, authedRequest("GET", path, "", "", "test"))
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		var page struct {
			Activity []struct {
				ID         int64  `json:"id"`
				Message    string `json:"message"`
				CampaignID int64  `json:"campaign_id"`
			} `json:"activity"`
			Next *int64 `json:"next_cursor"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		for _, a := range page.Activity {
			if seen[a.ID] || a.Message != "recorded" || a.CampaignID != 1 {
				t.Fatalf("invalid activity: %+v", a)
			}
			seen[a.ID] = true
		}
		if page.Next == nil {
			break
		}
		cursor = *page.Next
	}
	if len(seen) != 5 {
		t.Fatalf("got %d older campaign records", len(seen))
	}
	for _, q := range []string{"limit=101", "cursor=-1", "campaign_id=bad"} {
		w := httptest.NewRecorder()
		s.handleActivity(w, authedRequest("GET", "/v1/activity?"+q, "", "", "test"))
		if w.Code != 400 {
			t.Fatal(q, w.Code)
		}
	}
}
