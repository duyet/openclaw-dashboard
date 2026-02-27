# OpenClaw Gateway Helper Scripts

Scripts for interacting with OpenClaw gateways outside of the dashboard.

## check-node-pairs

Check the node pairing status of a gateway (pending requests and paired nodes).

### Python Version (Recommended)

```bash
python3 scripts/check-node-pairs.py <GATEWAY_URL> <TOKEN>
```

**Requirements:**
```bash
pip install websocket-client
```

**Example:**
```bash
python3 scripts/check-node-pairs.py ws://localhost:8080/rpc your-secret-token
```

### Bash Version

```bash
./scripts/check-node-pairs.sh <GATEWAY_URL> <TOKEN>
```

**Requirements:** One of:
- Python 3 + `websocket-client` (pip install websocket-client)
- `websocat` (cargo install websocat)
- `wscat` (npm install -g wscat)

**Example:**
```bash
./scripts/check-node-pairs.sh ws://localhost:8080/rpc your-secret-token
```

### Example Output

```
OpenClaw Gateway Node Pairing Status
Gateway: ws://localhost:8080/rpc

Pending Node Pairing Requests:
  - None

Paired Nodes:
  - OpenClaw Mission Control
    Node ID: dashboard-prod-1
    Platform: web
    Token: sk_gateway_abc123...
    Approved: 2026-02-27 10:30:45
```

## Protocol Notes

These scripts use the OpenClaw WebSocket RPC protocol:

1. Connect with `?token=<TOKEN>` query parameter
2. Wait for `connect.challenge` event
3. Send `connect` request with client metadata and auth token
4. Wait for `hello-ok` response
5. Send actual RPC request (e.g., `node.pair.list`)
6. Receive response and close connection

See `/src/lib/services/gateway-rpc.ts` for the full protocol implementation.
