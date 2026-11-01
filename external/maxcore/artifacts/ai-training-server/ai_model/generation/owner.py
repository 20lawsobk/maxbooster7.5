"""Owner identity asserted only by the authenticated, actual loopback Node hop."""
import hmac
import re


def owned_path(path):
    return (path in {"/api/generate/audio", "/api/generate/image", "/api/generate-video",
                     "/api/analyze/audio", "/api/video-jobs"}
            or path.startswith(("/api/audio/", "/api/video/", "/api/video-job/",
                                "/api/audio-job/", "/api/files/stems/")))


def verify_owner(headers, *, peer, path, secret):
    names = ("authorization", "x-api-key", "x-admin-key")
    if hasattr(headers, "getlist"):
        for name in (*names, "x-maxcore-user-id"):
            if len(headers.getlist(name)) > 1:
                raise ValueError("Duplicate authentication or owner headers")
    supplied = [(name, headers.get(name)) for name in names if headers.get(name) is not None]
    if len(supplied) > 1:
        raise ValueError("Mixed authentication headers are not allowed")
    owner = headers.get("x-maxcore-user-id")
    private = False
    if supplied:
        name, credential = supplied[0]
        if name == "authorization":
            match = re.fullmatch(r"Bearer\s+(\S+)", credential, flags=re.IGNORECASE)
            credential = match.group(1) if match else ""
        private = bool(secret and hmac.compare_digest(credential.encode(), secret.encode()))
        if private and (name == "x-admin-key" or peer not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}):
            raise ValueError("Private channel requires an actual loopback peer and non-admin auth")
    if owner is not None:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", owner):
            raise ValueError("Invalid authenticated owner identifier")
        if not private:
            raise ValueError("Only the authenticated private channel may assert an owner")
    elif owned_path(path):
        raise ValueError("Authenticated private owner required for owned media path")
    return owner