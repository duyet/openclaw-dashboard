# Gateway WebSocket protocol

Mission Control communicates with OpenClaw gateway instances using JSON-RPC 2.0 over a persistent WebSocket connection.

## Protocol overview

- **Transport**: WebSocket (`ws://` or `wss://`)
- **Message format**: JSON-RPC 2.0
- **Auth**: bearer token sent as a query parameter (see below)
- **Connection model**: one WebSocket connection per RPC call; the connection is opened, the request is sent, the response is received, then the connection is closed

## Authentication

The WebSocket API in browser and edge environments does not support setting custom request headers. Authentication is therefore performed by appending the token as a query parameter:

```
ws://gateway-host:18789?token=<bearer-token>
```

The gateway validates this token on connection. If the token is invalid or absent when required, the gateway closes the connection.

## Request format

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "<method-name>",
  "params": { ... }
}
```

- `id` is a UUID generated per call using `crypto.randomUUID()`.
- `method` is a dotted method name (e.g. `sessions.list`).
- `params` is a JSON object containing method-specific parameters.

## Response format

### Success

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "result": { ... }
}
```

### Error

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "error": {
    "code": -32600,
    "message": "Invalid request",
    "data": { ... }
  }
}
```

`data` is optional. Errors with code `-1` indicate a transport or timeout error rather than a JSON-RPC application error.

## Timeouts

- **RPC calls** (`callGatewayRpc`): 30 seconds default. Configurable via the `timeoutMs` parameter.
- **Gateway status checks** (`checkGatewayConnection`): 10 seconds.

## Available methods

### Session management

| Method | Parameters | Description |
|---|---|---|
| `sessions.list` | `{}` | List all sessions on the gateway |
| `sessions.get` | `{ session_key }` | Get a single session by key |
| `sessions.create` | `{ session_key, agent_name, workspace_root?, identity_template?, soul_template? }` | Create a new session |
| `sessions.delete` | `{ session_key }` | Delete a session |
| `sessions.reset` | `{ session_key }` | Reset a session to its initial state |
| `sessions.bootstrap` | `{ session_key, force? }` | Bootstrap a session (run startup sequence) |
| `sessions.update_templates` | `{ session_key, identity_template?, soul_template? }` | Update identity or soul template for a session |
| `sessions.rotate_token` | `{ session_key }` | Rotate the agent token for a session |

### Messaging

| Method | Parameters | Description |
|---|---|---|
| `messages.send` | `{ session_key, agent_name, message, deliver? }` | Send a message to an agent session |

### Runtime

| Method | Parameters | Description |
|---|---|---|
| `runtime.info` | `{}` | Get gateway runtime information (version, capabilities) |

### Command execution

| Method | Parameters | Description |
|---|---|---|
| `commands.execute` | `{ session_key, command, args?, cwd? }` | Execute a command in the context of a session |

### Skill management

| Method | Parameters | Description |
|---|---|---|
| `skills.list` | `{}` | List installed skills on the gateway |
| `skills.install` | `{ source_url, name?, metadata? }` | Install a skill from a URL |
| `skills.uninstall` | `{ source_url }` | Uninstall a skill |
| `skills.sync_pack` | `{ source_url, branch?, name? }` | Sync a skill pack from a git repository |

## Client implementation

The RPC client is implemented in `src/lib/services/gateway-rpc.ts`. It exports:

- `callGatewayRpc(gatewayUrl, token, method, params, timeoutMs?)` — low-level function that opens a WebSocket, sends one JSON-RPC request, and resolves with the result
- `GatewayError` — error class thrown on connection failure, timeout, or JSON-RPC error; carries `code` and optional `data` fields
- Typed method helpers: `getSessions`, `getSession`, `createSession`, `deleteSession`, `resetSession`, `bootstrapSession`, `updateSessionTemplates`, `rotateToken`, `sendMessage`, `getRuntimeInfo`, `executeCommand`, `installSkill`, `uninstallSkill`, `listSkills`, `syncSkillPack`

Example usage:

```typescript
import { getSessions, GatewayError } from "@/lib/services/gateway-rpc";

try {
  const sessions = await getSessions({ url: "ws://localhost:18789", token: "my-token" });
} catch (err) {
  if (err instanceof GatewayError) {
    console.error(err.message, err.code, err.data);
  }
}
```

## Gateway status check (client-side only)

The gateway connectivity check (`checkGatewayConnection` in `src/lib/gateway-form.ts`) is performed directly from the **browser** via a WebSocket connection — it does not go through the Mission Control API server.

This is intentional: gateways are often on an internal or Tailscale network that is reachable from the user's browser but not from the Cloudflare edge worker running Mission Control's API. Routing the check through the API would therefore always fail for privately networked gateways.

The status check sends a lightweight `sessions.list` call with a 10-second timeout. On success it resolves `{ ok: true, message: "Gateway reachable." }`.

HTTP/HTTPS URLs are automatically normalised to `ws://` / `wss://` before the connection attempt.

## Error handling

`GatewayError` is thrown in these cases:

- The WebSocket connection cannot be established (network unreachable, DNS failure)
- The connection is closed by the gateway before a response is received
- The call times out (default 30s for RPC, 10s for status checks)
- The gateway returns a JSON-RPC error object

The error `code` is the JSON-RPC error code from the gateway, or `-1` for transport/timeout errors.
