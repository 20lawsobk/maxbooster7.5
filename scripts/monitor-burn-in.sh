#!/bin/bash

# Real-time Burn-in Test Monitoring Dashboard
# Updates every 5 seconds

clear

while true; do
  # Move cursor to top
  tput cup 0 0
  
  echo "╔══════════════════════════════════════════════════════════════════════════════╗"
  echo "║                    MAX BOOSTER 24-HOUR BURN-IN MONITOR                       ║"
  echo "║                        Updated: $(date '+%Y-%m-%d %H:%M:%S')                        ║"
  echo "╚══════════════════════════════════════════════════════════════════════════════╝"
  echo ""
  
  # Burn-in Test Progress
  echo "┌─ BURN-IN TEST PROGRESS ─────────────────────────────────────────────────────┐"
  tail -30 /tmp/logs/Burn-in_Test_*.log 2>/dev/null | tail -25 || echo "  Waiting for test to start..."
  echo "└──────────────────────────────────────────────────────────────────────────────┘"
  echo ""
  
  # Memory Usage
  echo "┌─ MEMORY USAGE ───────────────────────────────────────────────────────────────┐"
  curl -s http://localhost:5000/api/system/memory 2>/dev/null | jq -r '
    "  Current Heap: \(.current.heapUsedMB)MB / \(.current.heapTotalMB)MB",
    "  RSS Memory:   \(.current.rssMB)MB",
    "  Average Heap: \(.trend.avgHeapUsedMB)MB",
    "  Peak Heap:    \(.trend.maxHeapUsedMB)MB",
    "  Warning at:   \(.thresholds.warningMB)MB",
    "  Critical at:  \(.thresholds.criticalMB)MB",
    "  Samples:      \(.leakDetection.samplesCollected) collected"
  ' 2>/dev/null || echo "  Fetching..."
  echo "└──────────────────────────────────────────────────────────────────────────────┘"
  echo ""
  
  # Queue Metrics
  echo "┌─ QUEUE METRICS ──────────────────────────────────────────────────────────────┐"
  curl -s http://localhost:5000/api/monitoring/queue-metrics 2>/dev/null | jq -r '
    if .metrics and (.metrics | length > 0) then
      .metrics[] | 
      "  Queue: \(.queueName)",
      "    Waiting:    \(.waiting) jobs",
      "    Active:     \(.active) jobs", 
      "    Completed:  \(.completed) jobs",
      "    Failed:     \(.failed) jobs",
      "    Delayed:    \(.delayed) jobs",
      "    Paused:     \(if .paused then "YES ⚠️" else "NO ✓" end)",
      "    Redis RTT:  \(.redisLatency)ms",
      "    Fail Rate:  \(.failedRate)%"
    else
      "  No queue data available"
    end
  ' 2>/dev/null || echo "  Fetching..."
  echo "└──────────────────────────────────────────────────────────────────────────────┘"
  echo ""
  
  # System Health
  echo "┌─ SYSTEM HEALTH ──────────────────────────────────────────────────────────────┐"
  curl -s http://localhost:5000/api/monitoring/system-health 2>/dev/null | jq -r '
    "  Status:     \(if .healthy then "✅ HEALTHY" else "❌ UNHEALTHY" end)",
    "  Uptime:     \(.uptime // "N/A")",
    "  Timestamp:  \(.timestamp)"
  ' 2>/dev/null || echo "  Fetching..."
  echo "└──────────────────────────────────────────────────────────────────────────────┘"
  echo ""
  
  # AI Models
  echo "┌─ AI MODEL TELEMETRY ─────────────────────────────────────────────────────────┐"
  curl -s http://localhost:5000/api/monitoring/ai-models 2>/dev/null | jq -r '
    if .metrics then
      "  Social Autopilot:",
      "    Models Loaded:  \(.metrics.socialAutopilot.modelsLoaded)",
      "    Cache Hit Rate: \(.metrics.socialAutopilot.cacheHitRate)%",
      "  ",
      "  Ad Autopilot:",
      "    Models Loaded:  \(.metrics.adAutopilot.modelsLoaded)",
      "    Cache Hit Rate: \(.metrics.adAutopilot.cacheHitRate)%"
    else
      "  No AI telemetry available"
    end
  ' 2>/dev/null || echo "  Fetching..."
  echo "└──────────────────────────────────────────────────────────────────────────────┘"
  echo ""
  
  # Queue Health
  echo "┌─ QUEUE HEALTH STATUS ────────────────────────────────────────────────────────┐"
  curl -s http://localhost:5000/api/monitoring/queue-health 2>/dev/null | jq -r '
    "  Overall:    \(if .healthy then "✅ HEALTHY" else "❌ UNHEALTHY" end)",
    "  Details:    \(.details // "N/A")",
    "  Timestamp:  \(.timestamp)"
  ' 2>/dev/null || echo "  Fetching..."
  echo "└──────────────────────────────────────────────────────────────────────────────┘"
  echo ""
  
  echo "Press Ctrl+C to exit | Refreshing every 5 seconds..."
  
  # Wait 5 seconds before next update
  sleep 5
done
