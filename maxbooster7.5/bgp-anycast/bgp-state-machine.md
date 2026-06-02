# BGP State Machine

The BGP (Border Gateway Protocol) Finite State Machine (FSM) consists of several states through which a BGP session passes before it becomes fully operational.

### 1. Idle

The initial state. BGP waits for a "start event" (usually the BIRD2 service starting). It refuses all incoming connections.

### 2. Connect

BGP waits for the TCP connection to be completed with the neighbor. If successful, it sends an OPEN message and moves to **OpenSent**. If it fails, it moves to **Active**.

### 3. Active

BGP tries to initiate a TCP connection with the neighbor. If successful, it sends an OPEN message and moves to **OpenSent**.

### 4. OpenSent

BGP has sent an OPEN message and is waiting for an OPEN message from its neighbor. Once received, it checks for errors (ASN mismatch, version, etc.). If okay, it sends a KEEPALIVE and moves to **OpenConfirm**.

### 5. OpenConfirm

BGP waits for a KEEPALIVE or NOTIFICATION message. If it receives a KEEPALIVE, it moves to **Established**.

### 6. Established

The session is fully operational. BGP can now exchange UPDATE messages (advertising or withdrawing routes).

---

## Troubleshooting with BIRD2

Use `birdc` to inspect the state:

- `birdc show protocols`: See overall status of the `upstream` protocol.
- `birdc show protocols all upstream`: See detailed stats and state.
- `birdc show route`: See what routes BIRD2 knows about.
- `birdc show route export upstream`: See what routes are being sent to the neighbor.
