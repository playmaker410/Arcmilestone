package handlers

import (
	"net/http"

	"arcmilestone/utils"
)

// Health reports that the HTTP service is available. It intentionally has no
// database dependency, so it remains useful before MySQL is configured.
func Health(w http.ResponseWriter, _ *http.Request) {
	utils.WriteJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "ArcMilestone API",
	})
}
