use axum::{
    extract::State,
    http::StatusCode,
    middleware::{self, Next},
    extract::Request,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use boosterstate::model::*;
use boosterstate::BoosterState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::SystemTime;
use std::{io, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;
use tower_http::cors::CorsLayer;

#[derive(Serialize)]
struct HealthResponse {
    status: String,
}

#[derive(Deserialize)]
struct KvGetReq {
    key: String,
}

#[derive(Serialize)]
struct KvGetResp {
    value: Option<String>,
}

#[derive(Deserialize)]
struct KvSetReq {
    key: String,
    value: String,
    ttl_secs: Option<u64>,
}

#[derive(Deserialize)]
struct KvDelReq {
    keys: Vec<String>,
}

#[derive(Serialize)]
struct KvDelResp {
    deleted: u64,
}

#[derive(Deserialize)]
struct KvExistsReq {
    key: String,
}

#[derive(Serialize)]
struct KvExistsResp {
    exists: bool,
}

#[derive(Deserialize)]
struct KvIncrReq {
    key: String,
}

#[derive(Serialize)]
struct KvIncrResp {
    value: i64,
}

#[derive(Deserialize)]
struct KvExpireReq {
    key: String,
    seconds: u64,
}

#[derive(Serialize)]
struct KvExpireResp {
    ok: bool,
}

#[derive(Deserialize)]
struct KvKeysReq {
    pattern: String,
}

#[derive(Serialize)]
struct KvKeysResp {
    keys: Vec<String>,
}

#[derive(Deserialize)]
struct ZAddReq {
    key: String,
    score: f64,
    value: String,
}

#[derive(Deserialize)]
struct ZCardReq {
    key: String,
}

#[derive(Serialize)]
struct ZCardResp {
    count: u64,
}

#[derive(Deserialize)]
struct ZRangeReq {
    key: String,
    start: i64,
    end: i64,
    rev: Option<bool>,
}

#[derive(Serialize)]
struct ZRangeResp {
    values: Vec<String>,
}

#[derive(Deserialize)]
struct ZRemRangeByScoreReq {
    key: String,
    min: String,
    max: String,
}

#[derive(Serialize)]
struct ZRemRangeByScoreResp {
    removed: u64,
}

#[derive(Deserialize)]
struct QueuePushReq {
    queue: String,
    data: String,
    priority: Option<i32>,
}

#[derive(Serialize)]
struct QueuePushResp {
    id: String,
}

#[derive(Deserialize)]
struct QueuePopReq {
    queue: String,
}

#[derive(Serialize)]
struct QueuePopItem {
    id: String,
    data: String,
}

#[derive(Serialize)]
struct QueuePopResp {
    item: Option<QueuePopItem>,
}

#[derive(Deserialize)]
struct RateTakeReq {
    key: String,
    tokens: u64,
    #[allow(dead_code)]
    capacity: Option<u64>,
    #[allow(dead_code)]
    refill_per_sec: Option<u64>,
}

#[derive(Serialize)]
struct RateTakeResp {
    allowed: bool,
    remaining: u64,
}

type AppState = Arc<BoosterState>;

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok".to_string() })
}

async fn ping_handler() -> &'static str {
    "PONG"
}

async fn kv_get_handler(
    State(state): State<AppState>,
    Json(req): Json<KvGetReq>,
) -> impl IntoResponse {
    match state.flat_get(&req.key).await {
        Ok(val) => (StatusCode::OK, Json(KvGetResp { value: val })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn kv_set_handler(
    State(state): State<AppState>,
    Json(req): Json<KvSetReq>,
) -> impl IntoResponse {
    match state.flat_set(&req.key, &req.value, req.ttl_secs).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn kv_del_handler(
    State(state): State<AppState>,
    Json(req): Json<KvDelReq>,
) -> impl IntoResponse {
    match state.flat_del(&req.keys).await {
        Ok(deleted) => (StatusCode::OK, Json(KvDelResp { deleted })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn kv_exists_handler(
    State(state): State<AppState>,
    Json(req): Json<KvExistsReq>,
) -> impl IntoResponse {
    match state.flat_exists(&req.key).await {
        Ok(exists) => (StatusCode::OK, Json(KvExistsResp { exists })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn kv_incr_handler(
    State(state): State<AppState>,
    Json(req): Json<KvIncrReq>,
) -> impl IntoResponse {
    match state.flat_incr(&req.key).await {
        Ok(value) => (StatusCode::OK, Json(KvIncrResp { value })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn kv_expire_handler(
    State(state): State<AppState>,
    Json(req): Json<KvExpireReq>,
) -> impl IntoResponse {
    match state.flat_expire(&req.key, req.seconds).await {
        Ok(ok) => (StatusCode::OK, Json(KvExpireResp { ok })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn kv_keys_handler(
    State(state): State<AppState>,
    Json(req): Json<KvKeysReq>,
) -> impl IntoResponse {
    match state.flat_keys(&req.pattern).await {
        Ok(keys) => (StatusCode::OK, Json(KvKeysResp { keys })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn zset_add_handler(
    State(state): State<AppState>,
    Json(req): Json<ZAddReq>,
) -> impl IntoResponse {
    match state.zadd(&req.key, req.score, req.value).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn zset_card_handler(
    State(state): State<AppState>,
    Json(req): Json<ZCardReq>,
) -> impl IntoResponse {
    match state.zcard(&req.key).await {
        Ok(count) => (StatusCode::OK, Json(ZCardResp { count })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn zset_range_handler(
    State(state): State<AppState>,
    Json(req): Json<ZRangeReq>,
) -> impl IntoResponse {
    let rev = req.rev.unwrap_or(false);
    match state.zrange(&req.key, req.start, req.end, rev).await {
        Ok(values) => (StatusCode::OK, Json(ZRangeResp { values })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

fn parse_score_bound(s: &str) -> f64 {
    match s {
        "-inf" => f64::NEG_INFINITY,
        "+inf" | "inf" => f64::INFINITY,
        other => other.parse::<f64>().unwrap_or(0.0),
    }
}

async fn zset_rem_range_by_score_handler(
    State(state): State<AppState>,
    Json(req): Json<ZRemRangeByScoreReq>,
) -> impl IntoResponse {
    let min = parse_score_bound(&req.min);
    let max = parse_score_bound(&req.max);
    match state.zrem_range_by_score(&req.key, min, max).await {
        Ok(removed) => (StatusCode::OK, Json(ZRemRangeByScoreResp { removed })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn queue_push_handler(
    State(state): State<AppState>,
    Json(req): Json<QueuePushReq>,
) -> impl IntoResponse {
    let id = uuid::Uuid::new_v4().to_string();
    let priority = req.priority.unwrap_or(0);
    let item = QueueItem {
        id: id.clone(),
        payload: Value::String(req.data),
        priority,
        visible_at: SystemTime::now(),
        dedupe_key: None,
        attempts: 0,
    };
    match state.queue_push("default".to_string(), "default".to_string(), req.queue, item).await {
        Ok(()) => (StatusCode::OK, Json(QueuePushResp { id })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn queue_pop_handler(
    State(state): State<AppState>,
    Json(req): Json<QueuePopReq>,
) -> impl IntoResponse {
    match state.queue_pop("default", "default", &req.queue).await {
        Ok(Some(item)) => {
            let data = match &item.payload {
                Value::String(s) => s.clone(),
                Value::Json(v) => v.to_string(),
            };
            (StatusCode::OK, Json(QueuePopResp {
                item: Some(QueuePopItem { id: item.id, data }),
            })).into_response()
        }
        Ok(None) => (StatusCode::OK, Json(QueuePopResp { item: None })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn rate_take_handler(
    State(state): State<AppState>,
    Json(req): Json<RateTakeReq>,
) -> impl IntoResponse {
    match state.rate_take("default", "default", &req.key, req.tokens).await {
        Ok((allowed, rate_state)) => {
            (StatusCode::OK, Json(RateTakeResp { allowed, remaining: rate_state.tokens })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// Bearer token auth middleware.
/// If BOOSTERSTATE_SECRET is set, every request must carry:
///   Authorization: Bearer <secret>
/// If the env var is not set the middleware is a no-op (backward compatible).
async fn auth_middleware(
    secret: Arc<String>,
    req: Request,
    next: Next,
) -> Response {
    if secret.is_empty() {
        return next.run(req).await;
    }
    let provided = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let expected = format!("Bearer {}", secret);
    if provided == expected {
        next.run(req).await
    } else {
        (StatusCode::UNAUTHORIZED, "Unauthorized").into_response()
    }
}

async fn existing_instance_is_healthy(addr: &str, secret: &str) -> bool {
    timeout(Duration::from_millis(500), async {
        let Ok(mut stream) = TcpStream::connect(addr).await else {
            return false;
        };

        // Never interpolate a malformed value into an HTTP header. The secret
        // is sent only to the loopback health endpoint and is never logged.
        if secret.contains('\r') || secret.contains('\n') {
            return false;
        }
        let authorization = if secret.is_empty() {
            String::new()
        } else {
            format!("Authorization: Bearer {secret}\r\n")
        };
        let request = format!(
            "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\n{authorization}Connection: close\r\n\r\n"
        );
        if stream.write_all(request.as_bytes()).await.is_err() {
            return false;
        }

        let mut status_prefix = [0_u8; 12];
        stream
            .read_exact(&mut status_prefix)
            .await
            .is_ok_and(|_| {
                status_prefix == *b"HTTP/1.1 200" || status_prefix == *b"HTTP/1.0 200"
            })
    })
    .await
    .unwrap_or(false)
}

async fn bind_or_reuse(addr: &str, secret: &str) -> anyhow::Result<Option<TcpListener>> {
    match TcpListener::bind(addr).await {
        Ok(listener) => Ok(Some(listener)),
        Err(error) if error.kind() == io::ErrorKind::AddrInUse => {
            if existing_instance_is_healthy(addr, secret).await {
                Ok(None)
            } else {
                Err(anyhow::anyhow!(
                    "BoosterState port {addr} is occupied by a process that failed authenticated health verification"
                ))
            }
        }
        Err(error) => Err(error.into()),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let port: u16 = std::env::var("BOOSTERSTATE_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9877);

    let n_shards: usize = std::env::var("BOOSTERSTATE_SHARDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| num_cpus::get() * 2);

    let data_dir = std::env::var("BOOSTERSTATE_DATA_DIR")
        .unwrap_or_else(|_| "./boosterstate-data".to_string());

    let secret = Arc::new(
        std::env::var("BOOSTERSTATE_SECRET").unwrap_or_default()
    );

    if secret.is_empty() {
        println!("BoosterState: running without auth (set BOOSTERSTATE_SECRET to enable)");
    } else {
        println!("BoosterState: bearer token auth enabled");
    }

    let addr = format!("127.0.0.1:{port}");
    let listener = match bind_or_reuse(&addr, secret.as_str()).await? {
        Some(listener) => listener,
        None => {
            println!("BoosterState already healthy on {addr}; duplicate startup skipped");
            return Ok(());
        }
    };

    // Acquire the listener before opening the WAL so a competing startup never
    // opens the same persistent files while another process owns the service.
    let state = Arc::new(BoosterState::new_with_wal(data_dir.into(), n_shards)?);

    let auth_secret = secret.clone();
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/ping", get(ping_handler))
        .route("/kv/get", post(kv_get_handler))
        .route("/kv/set", post(kv_set_handler))
        .route("/kv/del", post(kv_del_handler))
        .route("/kv/exists", post(kv_exists_handler))
        .route("/kv/incr", post(kv_incr_handler))
        .route("/kv/expire", post(kv_expire_handler))
        .route("/kv/keys", post(kv_keys_handler))
        .route("/zset/add", post(zset_add_handler))
        .route("/zset/card", post(zset_card_handler))
        .route("/zset/range", post(zset_range_handler))
        .route("/zset/rem-range-by-score", post(zset_rem_range_by_score_handler))
        .route("/queue/push", post(queue_push_handler))
        .route("/queue/pop", post(queue_pop_handler))
        .route("/rate/take", post(rate_take_handler))
        .route_layer(middleware::from_fn(move |req: Request, next: Next| {
            let s = auth_secret.clone();
            async move { auth_middleware(s, req, next).await }
        }))
        .layer(CorsLayer::permissive())
        .with_state(state);

    println!("BoosterState listening on {}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::bind_or_reuse;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    async fn mock_health_server(
        expected_authorization: Option<&'static str>,
    ) -> (String, JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap().to_string();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = [0_u8; 1024];
            let size = stream.read(&mut request).await.unwrap();
            let request = String::from_utf8_lossy(&request[..size]).to_string();
            let provided_authorization = request
                .lines()
                .find(|line| line.to_ascii_lowercase().starts_with("authorization:"))
                .map(str::to_string);
            let matches = match expected_authorization {
                Some(expected) => provided_authorization.as_deref() == Some(expected),
                None => provided_authorization.is_none(),
            };
            let status = if matches { "200 OK" } else { "401 Unauthorized" };
            stream
                .write_all(
                    format!(
                        "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            request
        });
        (address, task)
    }

    #[tokio::test]
    async fn binds_when_no_listener_owns_the_port() {
        let listener = bind_or_reuse("127.0.0.1:0", "")
            .await
            .unwrap()
            .expect("new startup should own an available port");
        assert!(listener.local_addr().is_ok());
    }

    #[tokio::test]
    async fn reuses_an_existing_instance_only_after_authenticated_health_check() {
        let (address, server) =
            mock_health_server(Some("Authorization: Bearer test-secret")).await;

        assert!(bind_or_reuse(&address, "test-secret")
            .await
            .unwrap()
            .is_none());
        assert!(server
            .await
            .unwrap()
            .contains("Authorization: Bearer test-secret"));
    }

    #[tokio::test]
    async fn rejects_a_listener_that_fails_health_authentication() {
        let (address, server) =
            mock_health_server(Some("Authorization: Bearer expected-secret")).await;

        let error = bind_or_reuse(&address, "wrong-secret")
            .await
            .unwrap_err();
        assert!(error
            .to_string()
            .contains("authenticated health verification"));
        assert!(server
            .await
            .unwrap()
            .contains("Authorization: Bearer wrong-secret"));
    }

    #[tokio::test]
    async fn rejects_an_unexpected_open_health_endpoint() {
        let (address, server) = mock_health_server(None).await;

        let error = bind_or_reuse(&address, "configured-secret")
            .await
            .unwrap_err();
        assert!(error
            .to_string()
            .contains("authenticated health verification"));
        assert!(server
            .await
            .unwrap()
            .contains("Authorization: Bearer configured-secret"));
    }
}
