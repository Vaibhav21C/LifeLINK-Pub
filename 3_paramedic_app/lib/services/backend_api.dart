import 'dart:convert';
import 'package:http/http.dart' as http;

class BackendApi {
  // Change this IP if running on a physical device on your local network
  static const String serverUrl = "http://98.82.131.184:8000";

  /// Sends paramedic GPS + ID to the backend every 5 seconds while patrolling
  static Future<void> sendHeartbeat(
    String paramedicId,
    double lat,
    double lon,
  ) async {
    try {
      await http.post(
        Uri.parse('$serverUrl/api/paramedic-heartbeat'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({"paramedic_id": paramedicId, "lat": lat, "lon": lon}),
      );
    } catch (e) {} // Silent — heartbeat is best-effort
  }

  /// Locks the dispatch in the FastAPI server
  static Future<Map<String, dynamic>> acceptDispatch(
    String incidentId,
    String ambulanceId,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$serverUrl/api/accept-dispatch'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "incident_id": incidentId,
          "ambulance_id": ambulanceId,
        }),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {"status": "error", "message": "Failed to connect to server."};
    }
  }

  /// Sends live GPS to the server
  static Future<void> sendLocation(
    String incidentId,
    double lat,
    double lon,
  ) async {
    try {
      await http.post(
        Uri.parse('$serverUrl/api/update-location'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({"incident_id": incidentId, "lat": lat, "lon": lon}),
      );
    } catch (e) {}
  }

  /// Listens for new crashes from the Edge AI / Ambulance Tracking app
  /// Pass paramedicId so the server only responds if this paramedic is the assigned one
  static Future<Map<String, dynamic>> checkPendingDispatch(
    String paramedicId,
  ) async {
    try {
      final response = await http.get(
        Uri.parse('$serverUrl/api/check-dispatch?paramedic_id=$paramedicId'),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {"status": "waiting"};
    }
  }

  /// Triggers the AWS GenAI Triage summary via the backend
  static Future<Map<String, dynamic>> scanPatientId(String patientId) async {
    try {
      final response = await http.post(
        Uri.parse('$serverUrl/api/paramedic-scan'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({"patient_id": patientId}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {"status": "error", "message": "Failed to connect to server."};
    }
  }
}
