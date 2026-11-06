import '../../../lib/assert-server';

export const SUPPORT_UNREAD_INDEX = 'arrakis:guild-support-unread';
export const supportReceiptFunctions = `
  local function decode(value)
    local ok, result = pcall(cjson.decode, value or '{}')
    if ok and type(result) == 'table' then return result end
    return {}
  end
  local function message_key(message)
    if type(message.id) == 'string' and type(message.senderId) == 'string' then
      return message.senderId .. ':' .. message.id
    end
    return nil
  end
  local function support_seen(chatKey, party)
    local result = {}
    for _, key in ipairs(decode(redis.call('HGET', chatKey .. ':seen', party))) do result[key] = true end
    return result
  end
  local function support_unread(chatKey, party)
    local seen = support_seen(chatKey, party)
    local role = party == 'admin' and 'applicant' or 'reviewer'
    local count = 0
    for _, encoded in ipairs(redis.call('LRANGE', chatKey, -100, -1)) do
      local message = decode(encoded)
      local key = message_key(message)
      if key and message.role == role and not seen[key] then count = count + 1 end
    end
    return count
  end
  local function sync_admin_index(chatKey, guildId, indexKey, now)
    local ttl = redis.call('TTL', chatKey)
    if ttl <= 0 then return end
    local seen = support_seen(chatKey, 'admin')
    for _, encoded in ipairs(redis.call('LRANGE', chatKey, -100, -1)) do
      local message = decode(encoded)
      local key = message_key(message)
      if key and message.role == 'applicant' then
        if seen[key] then redis.call('ZREM', indexKey, guildId .. ':' .. key)
        else redis.call('ZADD', indexKey, now + ttl * 1000, guildId .. ':' .. key) end
      end
    end
    redis.call('EXPIRE', indexKey, 7776000)
  end
`;
