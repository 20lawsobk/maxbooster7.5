"""Redis-atomic ownership fencing. Requires canonical PDIM EVAL support."""
LEASE_KEY = "awareness:v1:ingest-lease"
LEASE_SECONDS = 45

RENEW = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('EXPIRE', KEYS[1], ARGV[2])
"""
RELEASE = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
"""
PUBLISH_SOURCE_OBSERVATIONS = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1
"""
PUBLISH = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) + tonumber(clock[2]) / 1000000
local created = tonumber(ARGV[4])
local expires = tonumber(ARGV[5])
if expires <= now or created > now + 5 then return -2 end
local previous = redis.call('GET', KEYS[3])
if previous then
  local ok, pointer = pcall(cjson.decode, previous)
  if not ok or not pointer.id then return -3 end
  if not pointer.created_at then
    local oldblob = redis.call('GET', ARGV[7] .. pointer.id)
    if not oldblob then return -3 end
    local oldok, old = pcall(cjson.decode, oldblob)
    if not oldok or old.id ~= pointer.id or not old.created_at then return -3 end
    pointer.created_at = old.created_at
  end
  if tonumber(pointer.created_at) > created then return -4 end
  if tonumber(pointer.created_at) == created and pointer.id ~= ARGV[6] then return -4 end
end
local blob = redis.call('GET', KEYS[2])
if blob and blob ~= ARGV[2] then return -5 end
if not blob then redis.call('SET', KEYS[2], ARGV[2], 'NX') end
redis.call('SET', KEYS[3], ARGV[3])
return 1
"""