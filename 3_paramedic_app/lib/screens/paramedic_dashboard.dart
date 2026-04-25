import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/backend_api.dart';
import 'login_page.dart';

/// URL of the ambulance tracking web app (change if deployed remotely)
const String _trackingAppBaseUrl = 'http://localhost:5173';

class ParamedicDashboard extends StatefulWidget {
  final String paramedicName;
  const ParamedicDashboard({super.key, this.paramedicName = 'Paramedic'});

  @override
  State<ParamedicDashboard> createState() => _ParamedicDashboardState();
}

class _ParamedicDashboardState extends State<ParamedicDashboard> {
  bool isPatrolling = true;
  bool isDispatched = false;
  bool isScanning = false;
  bool scanDone = false;         // ← true once triage summary loads
  String triageSummary = "Awaiting patient scan...";
  String currentIncidentId = "";
  LatLng? crashLocation; // Parsed from the dispatch response
  double? distToCrashKm; // How far this paramedic is from the crash

  Timer? _pollingTimer;
  Timer? _heartbeatTimer;
  Timer? _driveTimer;

  // Mock patrolling GPS — each paramedic starts at a slightly different position
  // so the backend can find the "nearest" one
  late double patrolLat;
  late double patrolLon;

  // Road-following route — generated dynamically from crashLocation when dispatch is accepted
  List<LatLng> greenCorridorRoute = [];

  double currentLat = 22.6500;   // Will be overwritten from crashLocation
  double currentLon = 77.7400;
  double destLat    = 22.6500;   // Will be overwritten from crashLocation
  double destLon    = 77.7400;

  /// Extract the paramedic ID from the name (e.g. "Rahul Sharma" → "PMD-001")
  /// In a real app this would come from auth. Here we derive a stable mock ID.
  String get paramedicId {
    final ids = {
      'Rahul Sharma': 'PMD-001',
      'Priya Patel': 'PMD-002',
      'Arjun Singh': 'PMD-003',
    };
    return ids[widget.paramedicName] ?? 'PMD-001';
  }

  @override
  void initState() {
    super.initState();

    // Give each paramedic a slightly different starting patrol position
    // so the nearest-paramedic logic actually works
    final offsets = {
      'PMD-001': [0.000, 0.000], // ~5km from crash area — nearest
      'PMD-002': [0.015, -0.010], // ~6.5km from crash area
      'PMD-003': [0.030, -0.020], // ~8km from crash area
    };
    final offset = offsets[paramedicId] ?? [0.0, 0.0];
    // Patrol ~5km NW of Itarsi so ambulance travel to crash site is visible
    patrolLat = 22.6500 + offset[0];
    patrolLon = 77.7400 + offset[1];
    currentLat = patrolLat;
    currentLon = patrolLon;

    // Send heartbeat to backend every 5 seconds while patrolling
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (isPatrolling) {
        BackendApi.sendHeartbeat(paramedicId, patrolLat, patrolLon);
      }
    });
    // Send one immediately so we register right away
    BackendApi.sendHeartbeat(paramedicId, patrolLat, patrolLon);

    // Poll for dispatch every 3 seconds
    _pollingTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (isPatrolling) checkForCrash();
    });
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    _heartbeatTimer?.cancel();
    _driveTimer?.cancel();
    super.dispose();
  }

  Future<void> checkForCrash() async {
    final response = await BackendApi.checkPendingDispatch(paramedicId);
    if (response['status'] == 'found') {
      // Parse the crash GPS from the response
      final gpsStr = response['gps_location'] as String? ?? '';
      LatLng? parsed;
      try {
        final parts = gpsStr.split(',');
        parsed = LatLng(
          double.parse(parts[0].trim()),
          double.parse(parts[1].trim()),
        );
      } catch (_) {}

      setState(() {
        isPatrolling = false;
        currentIncidentId = response['incident_id'] as String? ?? 'CRASH-991';
        crashLocation = parsed;
        distToCrashKm = (response['assigned_dist_km'] as num?)?.toDouble();
      });
    }
  }

  Future<void> handleAcceptDispatch() async {
    final response = await BackendApi.acceptDispatch(
      currentIncidentId,
      paramedicId,
    );
    if (response['status'] == 'success') {
      // Build a 10-point corridor from crash → nearest hospital (~2 km south)
      final baseLat = crashLocation?.latitude  ?? currentLat;
      // Build a corridor from paramedic patrol location → crash site
      final startLat = currentLat;
      final startLon = currentLon;
      final endLat = crashLocation?.latitude ?? currentLat;
      final endLon = crashLocation?.longitude ?? currentLon;
      
      const steps = 10;
      final latStep = (endLat - startLat) / steps;
      final lonStep = (endLon - startLon) / steps;
      
      final route = List.generate(
        steps + 1,
        (i) => LatLng(startLat + latStep * i, startLon + lonStep * i),
      );
      
      setState(() {
        isDispatched = true;
        greenCorridorRoute = route;
        currentLat = startLat;
        currentLon = startLon;
        destLat = endLat;
        destLon = endLon;
      });
      startDrivingSimulator();
    }
  }

  void startDrivingSimulator() {
    int currentStep = 0;
    _driveTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (currentStep < greenCorridorRoute.length) {
        setState(() {
          currentLat = greenCorridorRoute[currentStep].latitude;
          currentLon = greenCorridorRoute[currentStep].longitude;
        });
        BackendApi.sendLocation(currentIncidentId, currentLat, currentLon);
        currentStep++;
      } else {
        timer.cancel();
      }
    });
  }

  Future<void> handleScanPatient() async {
    setState(() {
      isScanning = true;
      triageSummary = "Querying MediChain...";
    });
    final response = await BackendApi.scanPatientId("ABHA-123456");
    setState(() {
      isScanning = false;
      if (response['status'] == 'success') {
        triageSummary = response['ai_triage_summary'];
        scanDone = true;  // ← unlock the Continue button
      }
    });
  }

  /// Opens the ambulance tracking web app pre-loaded with crash coordinates.
  Future<void> _openGreenCorridorMap() async {
    final lat = crashLocation?.latitude ?? currentLat;
    final lon = crashLocation?.longitude ?? currentLon;
    final uri = Uri.parse('$_trackingAppBaseUrl/?lat=$lat&lng=$lon');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void resetApp() {
    _driveTimer?.cancel();
    setState(() {
      currentLat = patrolLat;
      currentLon = patrolLon;
      isPatrolling = true;
      isDispatched = false;
      isScanning = false;
      scanDone = false;
      crashLocation = null;
      distToCrashKm = null;
      currentIncidentId = "";
      triageSummary = "Awaiting patient scan...";
    });
    // Re-register as available
    BackendApi.sendHeartbeat(paramedicId, patrolLat, patrolLon);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'LifeLink • ${widget.paramedicName}',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: true,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: resetApp),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () {
              _pollingTimer?.cancel();
              _heartbeatTimer?.cancel();
              _driveTimer?.cancel();
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (_) => const LoginPage()),
              );
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ==========================================
            // STATE 0: PATROLLING
            // ==========================================
            if (isPatrolling) ...[
              const Spacer(),
              const Icon(Icons.local_hospital, size: 100, color: Colors.grey),
              const SizedBox(height: 24),
              Text(
                "$paramedicId Active\nPatrolling and listening for dispatches...",
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 20, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              // Show patrol coordinates as a subtle chip
              Center(
                child: Chip(
                  avatar: const Icon(
                    Icons.my_location,
                    size: 14,
                    color: Colors.green,
                  ),
                  label: Text(
                    '${patrolLat.toStringAsFixed(4)}, ${patrolLon.toStringAsFixed(4)}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                    ),
                  ),
                  backgroundColor: Colors.green[50],
                  side: const BorderSide(color: Colors.green),
                ),
              ),
              const Spacer(),
            ]
            // ==========================================
            // STATE 1: CRASH ALERT — MAP + ACCEPT/DECLINE
            // ==========================================
            else if (!isDispatched) ...[
              // Red alert banner
              Container(
                padding: const EdgeInsets.symmetric(
                  vertical: 10,
                  horizontal: 16,
                ),
                decoration: BoxDecoration(
                  color: Colors.red[900],
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      color: Colors.amberAccent,
                      size: 24,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '🚨 CRASH ALERT — $currentIncidentId',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          if (distToCrashKm != null)
                            Text(
                              'You are ${distToCrashKm!.toStringAsFixed(1)} km away — NEAREST UNIT',
                              style: const TextStyle(
                                color: Colors.amberAccent,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // CRASH LOCATION MAP
              Expanded(
                flex: 3,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter:
                          crashLocation ?? const LatLng(22.6116, 77.7810),
                      initialZoom: 14.0,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.lifelink.app',
                      ),
                      MarkerLayer(
                        markers: [
                          // 📍 Crash site
                          if (crashLocation != null)
                            Marker(
                              point: crashLocation!,
                              width: 50,
                              height: 50,
                              child: const Column(
                                children: [
                                  Icon(
                                    Icons.warning_amber_rounded,
                                    color: Colors.red,
                                    size: 36,
                                  ),
                                  Text(
                                    'CRASH',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.red,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          // 🚑 My patrol position
                          Marker(
                            point: LatLng(patrolLat, patrolLon),
                            width: 40,
                            height: 40,
                            child: const Icon(
                              Icons.emergency,
                              color: Colors.blue,
                              size: 36,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),

              // ACCEPT / DECLINE buttons
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.check_circle, color: Colors.white),
                      label: const Text(
                        "ACCEPT",
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green[700],
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed: handleAcceptDispatch,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(
                        Icons.cancel_outlined,
                        color: Colors.red,
                      ),
                      label: const Text(
                        "DECLINE",
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.red,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.red, width: 2),
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed: resetApp, // Decline = go back to patrolling
                    ),
                  ),
                ],
              ),
            ]
            // ==========================================
            // STATE 2: EN ROUTE — NAVIGATION MAP + SCANNER
            // ==========================================
            else ...[
              Expanded(
                flex: 2,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter: crashLocation ?? LatLng(currentLat, currentLon),
                      initialZoom: 13.5,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.lifelink.app',
                      ),
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: greenCorridorRoute,
                            strokeWidth: 6.0,
                            color: Colors.green.withAlpha(179),
                          ),
                        ],
                      ),
                      MarkerLayer(
                        markers: [
                          // Hospital
                          Marker(
                            point: LatLng(destLat, destLon),
                            width: 40,
                            height: 40,
                            child: const Icon(
                              Icons.local_hospital,
                              color: Colors.red,
                              size: 40,
                            ),
                          ),
                          // Crash site
                          if (crashLocation != null)
                            Marker(
                              point: crashLocation!,
                              width: 36,
                              height: 36,
                              child: const Icon(
                                Icons.warning_amber_rounded,
                                color: Colors.orange,
                                size: 36,
                              ),
                            ),
                          // Moving ambulance
                          Marker(
                            point: LatLng(currentLat, currentLon),
                            width: 40,
                            height: 40,
                            child: const Icon(
                              Icons.emergency,
                              color: Colors.blue,
                              size: 40,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              Expanded(
                flex: 1,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ElevatedButton.icon(
                      icon: isScanning
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(
                              Icons.qr_code_scanner,
                              color: Colors.white,
                            ),
                      label: const Text(
                        "SCAN PATIENT ID",
                        style: TextStyle(color: Colors.white, fontSize: 16),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue[800],
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      onPressed: isScanning ? null : handleScanPatient,
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.black87,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: SingleChildScrollView(
                          child: Text(
                            triageSummary,
                            style: const TextStyle(
                              fontSize: 14,
                              fontFamily: 'monospace',
                              color: Colors.amberAccent,
                            ),
                          ),
                        ),
                      ),
                    ),
                    // ── CONTINUE button — appears after scan succeeds ──
                    if (scanDone) ...[
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        icon: const Icon(
                          Icons.route_rounded,
                          color: Colors.white,
                        ),
                        label: const Text(
                          'CONTINUE → Green Corridor Map',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green[700],
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: _openGreenCorridorMap,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
