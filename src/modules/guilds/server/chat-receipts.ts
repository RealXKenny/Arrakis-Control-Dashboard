import '../../../lib/assert-server';

// Read tracking is scoped to the applicant and this specific submission's conversation.
export const chatReceiptFunctions = `
  local function decode_array(value)
    if not value then return {} end
    local ok, decoded = pcall(cjson.decode, value)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
  end
  local function reviewer_message(encoded)
    local ok, message = pcall(cjson.decode, encoded)
    if ok and type(message) == 'table' and message.role == 'reviewer' and type(message.id) == 'string' and type(message.senderId) == 'string' then return message end
    return nil
  end
  local function unread_count(chatKey)
    local seen = {}
    for _, key in ipairs(decode_array(redis.call('GET', chatKey .. ':seen'))) do seen[key] = true end
    local count = 0
    for _, encoded in ipairs(redis.call('LRANGE', chatKey, -100, -1)) do
      local message = reviewer_message(encoded)
      if message and not seen[message.senderId .. ':' .. message.id] then count = count + 1 end
    end
    return count
  end
`;
