#!/usr/bin/env python3
"""
check-node-pairs.py - Check OpenClaw gateway node pairing status

Usage:
    python3 scripts/check-node-pairs.py <GATEWAY_URL> <TOKEN>

Example:
    python3 scripts/check-node-pairs.py ws://localhost:8080/rpc your-secret-token
    python3 scripts/check-node-pairs.py wss://gateway.example.com/rpc your-secret-token

Requirements:
    pip install websocket-client
"""

import sys
import json
import ssl
import time
import uuid
from datetime import datetime

# ANSI color codes
RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
GRAY = "\033[0;90m"
NC = "\033[0m"  # No Color


def check_node_pairs(gateway_url: str, token: str) -> dict:
    """
    Connect to the gateway via WebSocket and call node.pair.list

    Returns:
        dict with 'pending' and 'paired' lists

    Raises:
        Exception: on connection or RPC errors
    """
    try:
        import websocket
    except ImportError:
        print(f"{RED}Error: websocket-client not installed{NC}")
        print(f"\nInstall it with: pip install websocket-client\n")
        sys.exit(1)

    # Append token as query param
    separator = "&" if "?" in gateway_url else "?"
    ws_url = f"{gateway_url}{separator}token={token}"

    # Generate UUIDs for the protocol
    connect_id = str(uuid.uuid4())
    rpc_id = str(uuid.uuid4())

    # Track connection phase
    phase = "awaiting-challenge"
    response_received = False
    result = {"pending": [], "paired": []}
    error_msg = None

    def on_message(ws, message):
        nonlocal phase, response_received, result, error_msg

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

        except (json.JSONDecodeError, KeyError):
            pass
        except Exception as e:
            error_msg = str(e)

    def on_error(ws, error):
        nonlocal error_msg
        error_msg = str(error)

    def on_close(ws, close_status_code, close_msg):
        nonlocal response_received
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

    # Run with timeout (disable cert verification for self-signed certs)
    ws.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE})

    if error_msg:
        raise Exception(error_msg)

    return result


def format_timestamp(ms: int) -> str:
    """Format millisecond timestamp as human-readable string"""
    return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M:%S")


def print_result(result: dict):
    """Print node pairing status in a readable format"""
    pending = result.get("pending", [])
    paired = result.get("paired", [])

    print(f"\n{YELLOW}Pending Node Pairing Requests:{NC}")
    if pending:
        for req in pending:
            display_name = req.get("displayName") or req.get("nodeId", "unknown")
            print(f"  - {display_name}")
            print(f"    Node ID: {req.get('nodeId', 'N/A')}")
            print(f"    Request ID: {req.get('requestId', 'N/A')}")
            if req.get("platform"):
                print(f"    Platform: {req.get('platform')}")
            if req.get("ts"):
                print(f"    Created: {format_timestamp(req.get('ts', 0))}")
    else:
        print("  - None")

    print(f"\n{GREEN}Paired Nodes:{NC}")
    if paired:
        for node in paired:
            display_name = node.get("displayName", "Paired Node")
            print(f"  - {display_name}")
            print(f"    Node ID: {node.get('nodeId', 'N/A')}")
            if node.get("platform"):
                print(f"    Platform: {node.get('platform')}")
            token = node.get("token", "")
            if token:
                print(f"    Token: {token[:20]}...")
            if node.get("approvedAtMs"):
                print(f"    Approved: {format_timestamp(node.get('approvedAtMs', 0))}")
    else:
        print("  - None")


def main():
    if len(sys.argv) < 2:
        print(f"{RED}Error: GATEWAY_URL is required{NC}")
        print(f"\nUsage: python3 {sys.argv[0]} <GATEWAY_URL> <TOKEN>")
        print(f"\nExample:")
        print(f"  python3 {sys.argv[0]} ws://localhost:8080/rpc your-secret-token")
        sys.exit(1)

    gateway_url = sys.argv[1]
    token = sys.argv[2] if len(sys.argv) > 2 else ""

    if not token:
        print(f"{RED}Error: TOKEN is required{NC}")
        print(f"\nUsage: python3 {sys.argv[0]} <GATEWAY_URL> <TOKEN>")
        sys.exit(1)

    # Ensure URL has /rpc suffix if not present
    if not gateway_url.endswith("/rpc"):
        if not gateway_url.endswith("/"):
            gateway_url += "/"
        gateway_url += "rpc"

    print(f"{BLUE}OpenClaw Gateway Node Pairing Status{NC}")
    print(f"{GRAY}Gateway: {gateway_url}{NC}")

    try:
        result = check_node_pairs(gateway_url, token)
        print_result(result)
    except Exception as e:
        print(f"\n{RED}Error: {e}{NC}")
        sys.exit(1)


if __name__ == "__main__":
    main()
