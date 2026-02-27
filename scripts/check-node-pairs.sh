#!/bin/bash
# check-node-pairs.sh - Check OpenClaw gateway node pairing status
#
# Usage: ./scripts/check-node-pairs.sh <GATEWAY_URL> <TOKEN>
#
# Example:
#   ./scripts/check-node-pairs.sh ws://localhost:8080/rpc your-secret-token
#   ./scripts/check-node-pairs.sh wss://gateway.example.com/rpc your-secret-token
#
# Requirements:
#   - Python 3 with websocket-client (pip install websocket-client)
#   - OR websocat (cargo install websocat)
#   - OR wscat (npm install -g wscat)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

GATEWAY_URL="$1"
TOKEN="$2"

# Validate arguments
if [ -z "$GATEWAY_URL" ]; then
  echo -e "${RED}Error: GATEWAY_URL is required${NC}"
  echo ""
  echo "Usage: $0 <GATEWAY_URL> <TOKEN>"
  echo ""
  echo "Example:"
  echo "  $0 ws://localhost:8080/rpc your-secret-token"
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo -e "${RED}Error: TOKEN is required${NC}"
  echo ""
  echo "Usage: $0 <GATEWAY_URL> <TOKEN>"
  exit 1
fi

# Ensure URL has /rpc suffix if not present
if [[ ! "$GATEWAY_URL" =~ /rpc$ ]]; then
  if [[ ! "$GATEWAY_URL" =~ /$ ]]; then
    GATEWAY_URL="${GATEWAY_URL}/"
  fi
  GATEWAY_URL="${GATEWAY_URL}rpc"
fi

echo -e "${BLUE}OpenClaw Gateway Node Pairing Status${NC}"
echo -e "${GRAY}Gateway: ${GATEWAY_URL}${NC}"
echo ""

# Try Python with websocket-client first
if command -v python3 &> /dev/null; then
  # Check if websocket-client is available
  if python3 -c "import websocket" 2>/dev/null; then
    echo -e "${GREEN}Using Python websocket-client...${NC}"
    python3 - "$GATEWAY_URL" "$TOKEN" << 'PYTHON_SCRIPT'
import sys
import json
import ssl
import time
import websocket

gateway_url = sys.argv[1]
token = sys.argv[2]

# Append token as query param
separator = "&" if "?" in gateway_url else "?"
ws_url = f"{gateway_url}{separator}token={token}"

# Generate UUIDs for the protocol
import uuid
connect_id = str(uuid.uuid4())
rpc_id = str(uuid.uuid4())

# Track connection phase
phase = "awaiting-challenge"
response_received = False
result = {"pending": [], "paired": []}
error_msg = None

def on_message(ws, message):
    global phase, response_received, result, error_msg

    try:
        frame = json.loads(message)
        if not isinstance(frame, dict) or "type" not in frame:
            return

        frame_type = frame["type"]

        # Phase 1: Waiting for connect.challenge
        if phase == "awaiting-challenge":
            if frame_type == "event" and frame.get("event") == "connect.challenge":
                # Send connect request
                connect_req = {
                    "type": "req",
                    "id": connect_id,
                    "method": "connect",
                    "params": {
                        "minProtocol": 3,
                        "maxProtocol": 3,
                        "client": {
                            "id": "check-node-pairs",
                            "version": "1.0.0",
                            "platform": "cli",
                            "mode": "backend"
                        },
                        "role": "operator",
                        "scopes": ["operator.read", "operator.write", "operator.pairing", "operator.admin"],
                        "caps": [],
                        "auth": {"token": token}
                    }
                }
                phase = "awaiting-hello"
                ws.send(json.dumps(connect_req))

        # Phase 2: Waiting for hello-ok
        elif phase == "awaiting-hello":
            if frame_type == "res" and frame.get("id") == connect_id:
                if frame.get("ok"):
                    # Send node.pair.list request
                    rpc_req = {
                        "type": "req",
                        "id": rpc_id,
                        "method": "node.pair.list",
                        "params": {}
                    }
                    phase = "awaiting-response"
                    ws.send(json.dumps(rpc_req))
                else:
                    error_msg = frame.get("error", {}).get("message", "Handshake failed")
                    ws.close()

        # Phase 3: Waiting for node.pair.list response
        elif phase == "awaiting-response":
            if frame_type == "res" and frame.get("id") == rpc_id:
                if frame.get("ok"):
                    result = frame.get("payload", {"pending": [], "paired": []})
                    response_received = True
                else:
                    error_msg = frame.get("error", {}).get("message", "RPC error")
                ws.close()

    except json.JSONDecodeError:
        pass
    except Exception as e:
        error_msg = str(e)

def on_error(ws, error):
    global error_msg
    error_msg = str(error)

def on_close(ws, close_status_code, close_msg):
    global response_received
    response_received = True

def on_open(ws):
    pass

# Create WebSocket connection
ws = websocket.WebSocketApp(
    ws_url,
    on_message=on_message,
    on_error=on_error,
    on_close=on_close,
    on_open=on_open
)

# Run with timeout
ws.run_forever(ssp={"cert_reqs": ssl.CERT_NONE})

# Output results
if error_msg:
    print(f"\033[0;31mError: {error_msg}\033[0m", file=sys.stderr)
    sys.exit(1)

# Format and display results
pending = result.get("pending", [])
paired = result.get("paired", [])

print("\033[1;33mPending Node Pairing Requests:\033[0m")
if pending:
    for req in pending:
        print(f"  - {req.get('displayName', req.get('nodeId', 'unknown'))}")
        print(f"    Node ID: {req.get('nodeId', 'N/A')}")
        print(f"    Request ID: {req.get('requestId', 'N/A')}")
        if req.get('platform'):
            print(f"    Platform: {req.get('platform')}")
        print(f"    Created: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(req.get('ts', 0) / 1000))}")
else:
    print("  - None")

print()
print("\033[0;32mPaired Nodes:\033[0m")
if paired:
    for node in paired:
        print(f"  - {node.get('displayName', 'Paired Node')}")
        print(f"    Node ID: {node.get('nodeId', 'N/A')}")
        if node.get('platform'):
            print(f"    Platform: {node.get('platform')}")
        print(f"    Token: {node.get('token', 'N/A')[:20]}...")
        print(f"    Approved: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(node.get('approvedAtMs', 0) / 1000))}")
else:
    print("  - None")

PYTHON_SCRIPT
    exit $?
  fi
fi

# Try websocat
if command -v websocat &> /dev/null; then
  echo -e "${GREEN}Using websocat...${NC}"

  # Create a temporary Python script for parsing
  PARSE_SCRIPT=$(mktemp)
  cat > "$PARSE_SCRIPT" << 'EOF'
import sys
import json
import time

lines = sys.stdin.read().split('\n')
connect_id = "connect-req"
rpc_id = "rpc-req"
sent_connect = False
sent_rpc = False

for line in lines:
    if not line.strip():
        continue
    try:
        frame = json.loads(line)
        if frame.get("type") == "event" and frame.get("event") == "connect.challenge":
            if not sent_connect:
                print(json.dumps({
                    "type": "req",
                    "id": connect_id,
                    "method": "connect",
                    "params": {
                        "minProtocol": 3,
                        "maxProtocol": 3,
                        "client": {"id": "check-node-pairs", "version": "1.0.0", "platform": "cli", "mode": "backend"},
                        "role": "operator",
                        "scopes": ["operator.read", "operator.write", "operator.pairing", "operator.admin"],
                        "caps": [],
                        "auth": {"token": sys.argv[1]}
                    }
                }))
                sent_connect = True
                sys.stdout.flush()
        elif frame.get("type") == "res" and frame.get("id") == connect_id:
            if frame.get("ok") and not sent_rpc:
                print(json.dumps({
                    "type": "req",
                    "id": rpc_id,
                    "method": "node.pair.list",
                    "params": {}
                }))
                sent_rpc = True
                sys.stdout.flush()
        elif frame.get("type") == "res" and frame.get("id") == rpc_id:
            if frame.get("ok"):
                result = frame.get("payload", {})
                pending = result.get("pending", [])
                paired = result.get("paired", [])

                print("\033[1;33mPending Node Pairing Requests:\033[0m")
                if pending:
                    for req in pending:
                        print(f"  - {req.get('displayName', req.get('nodeId', 'unknown'))}")
                        print(f"    Node ID: {req.get('nodeId', 'N/A')}")
                        print(f"    Request ID: {req.get('requestId', 'N/A')}")
                        if req.get('platform'):
                            print(f"    Platform: {req.get('platform')}")
                        print(f"    Created: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(req.get('ts', 0) / 1000))}")
                else:
                    print("  - None")

                print()
                print("\033[0;32mPaired Nodes:\033[0m")
                if paired:
                    for node in paired:
                        print(f"  - {node.get('displayName', 'Paired Node')}")
                        print(f"    Node ID: {node.get('nodeId', 'N/A')}")
                        if node.get('platform'):
                            print(f"    Platform: {node.get('platform')}")
                        print(f"    Token: {node.get('token', 'N/A')[:20]}...")
                        print(f"    Approved: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(node.get('approvedAtMs', 0) / 1000))}")
                else:
                    print("  - None")
            else:
                print(f"\033[0;31mError: {frame.get('error', {}).get('message', 'RPC error')}\033[0m", file=sys.stderr)
            sys.exit(0)
    except (json.JSONDecodeError, KeyError):
        pass
EOF

  separator="&"
  [[ "$GATEWAY_URL" != *\?* ]] && separator="?"
  WS_URL="${GATEWAY_URL}${separator}token=${TOKEN}"

  python3 "$PARSE_SCRIPT" "$TOKEN" < <(websocat -n --text "$WS_URL" 2>&1)
  exit $?
fi

# Try wscat
if command -v wscat &> /dev/null; then
  echo -e "${GREEN}Using wscat...${NC}"

  separator="&"
  [[ "$GATEWAY_URL" != *\?* ]] && separator="?"
  WS_URL="${GATEWAY_URL}${separator}token=${TOKEN}"

  # Create expect script for wscat interaction
  EXPECT_SCRIPT=$(mktemp)
  cat > "$EXPECT_SCRIPT" << EOF
package require Tcl 8.5
package require expect

spawn wscat -c "$WS_URL"
expect "Connected"

# Wait for connect.challenge and send connect request
expect {
    -regexp "connect.challenge" {
        sleep 0.5
        send "\\{\"type\":\"req\",\"id\":\"connect-req\",\"method\":\"connect\",\"params\":{\\\"minProtocol\\\":3,\\\"maxProtocol\\\":3,\\\"client\\\":{\\\"id\\\":\\\"check-node-pairs\\\",\\\"version\\\":\\\"1.0.0\\\",\\\"platform\\\":\\\"cli\\\",\\\"mode\\\":\\\"backend\\\"},\\\"role\\\":\\\"operator\\\",\\\"scopes\\\":[\\\"operator.read\\\",\\\"operator.write\\\",\\\"operator.pairing\\\",\\\"operator.admin\\\"],\\\"caps\\\":[],\\\"auth\\\":{\\\"token\\\":\\\"$TOKEN\\\"}}}\\}\r"
        exp_continue
    }
    timeout {
        puts "\\033\[0;31mTimeout waiting for challenge\\033\[0m"
        exit 1
    }
}

# After hello-ok, send node.pair.list request
expect {
    -regexp "hello-ok" {
        sleep 0.5
        send "\\{\"type\":\"req\",\"id\":\"rpc-req\",\"method\":\"node.pair.list\",\"params\\\":{}\\}\r"
        exp_continue
    }
    timeout {
        puts "\\033\[0;31mTimeout waiting for hello\\033\[0m"
        exit 1
    }
}

# Wait for response and display
expect {
    -regexp "pending|paired" {
        puts \$expect_out(buffer)
    }
    timeout {
        puts "\\033\[0;31mTimeout waiting for response\\033\[0m"
        exit 1
    }
}
EOF

  if command -v expect &> /dev/null; then
    expect "$EXPECT_SCRIPT"
    exit $?
  else
    echo -e "${YELLOW}Note: Install 'expect' for automated wscat interaction${NC}"
  fi
fi

# No suitable tool found
echo -e "${RED}Error: No suitable WebSocket tool found${NC}"
echo ""
echo "Please install one of the following:"
echo ""
echo "  1. Python websocket-client:"
echo "     pip install websocket-client"
echo ""
echo "  2. websocat:"
echo "     cargo install websocat"
echo ""
echo "  3. wscat:"
echo "     npm install -g wscat"
echo ""
exit 1
