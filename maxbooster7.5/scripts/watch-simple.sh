#!/bin/bash

# Simple real-time monitoring using watch command
# Choose what to monitor by passing argument

case "$1" in
  memory)
    watch -n 5 -c 'curl -s http://localhost:5000/api/system/memory | jq'
    ;;
  queues)
    watch -n 5 -c 'curl -s http://localhost:5000/api/monitoring/queue-metrics | jq'
    ;;
  health)
    watch -n 5 -c 'curl -s http://localhost:5000/api/monitoring/system-health | jq'
    ;;
  ai)
    watch -n 5 -c 'curl -s http://localhost:5000/api/monitoring/ai-models | jq'
    ;;
  test)
    watch -n 5 'tail -40 /tmp/logs/Burn-in_Test_*.log'
    ;;
  all)
    # Run the comprehensive dashboard
    exec ./scripts/monitor-burn-in.sh
    ;;
  *)
    echo "Usage: ./scripts/watch-simple.sh [memory|queues|health|ai|test|all]"
    echo ""
    echo "Options:"
    echo "  memory  - Watch memory usage in real-time"
    echo "  queues  - Watch queue metrics in real-time"
    echo "  health  - Watch system health in real-time"
    echo "  ai      - Watch AI model telemetry in real-time"
    echo "  test    - Watch burn-in test progress in real-time"
    echo "  all     - Full dashboard with all metrics (recommended)"
    exit 1
    ;;
esac
