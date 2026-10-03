// The action's effect AND its acknowledgement are one atomic Redis operation.
// Never expire/delete an acknowledgement while its PostgreSQL action is pending.
export const gameDeliveryScript = `
local previous = redis.call('GET', KEYS[1])
if previous then return previous end
local function reject(reason)
 local result = cjson.encode({state='REJECTED', reason=reason})
 redis.call('SET', KEYS[1], result)
 return result
end
-- Preflight types before writes: Redis Lua errors do not roll back earlier commands.
local types = {'string','string','hash','hash','set','hash','hash','list'}
for i=2,#KEYS do
 local t = redis.call('TYPE', KEYS[i]).ok
 if t ~= 'none' and t ~= types[i] then return redis.error_reply('Invalid game storage type') end
end
local d = cjson.decode(ARGV[1])
local p = d.payload
local now = tonumber(redis.call('TIME')[1]) * 1000
local roomExists = redis.call('EXISTS', KEYS[3])
if roomExists == 0 then return reject('Room closed') end
if d.kind == 'CHAT' then
 if now > d.expiresAt then return reject('Message expired') end
 redis.call('RPUSH', KEYS[8], cjson.encode(p))
 redis.call('LTRIM', KEYS[8], -100, -1)
else
 local raw = redis.call('GET', KEYS[2])
 if not raw then return reject('Round closed') end
 local q = cjson.decode(raw)
 if q.roundId ~= d.roundId then return reject('Round closed') end
 local status = redis.call('HGET', KEYS[3], 'status')
 if d.kind == 'VOTE' then
  if status ~= 'VOTE' or not q.voteUntil or now >= q.voteUntil then return reject('Voting closed') end
 else
  if status ~= 'PLAY' or not q.answerUntil or now >= q.answerUntil then return reject('Answers closed') end
 end
 -- Encode empty vote lists as arrays for existing game scoring code.
 local function encode(v) local encoded = string.gsub(cjson.encode(v), '"votes":{}', '"votes":[]'); return encoded end
 if d.kind == 'VOTE' then
  if p.votedUserId == d.userId then return reject('Cannot vote for yourself') end
  local targetRaw = redis.call('HGET', KEYS[4], p.votedUserId)
  if not targetRaw then return reject('Answer unavailable') end
  local target = cjson.decode(targetRaw)
  if target.answerId ~= p.answerId then return reject('Answer changed') end
  local oldId = redis.call('HGET', KEYS[6], d.userId)
  if oldId == p.votedUserId then return reject('Already voted for this answer') end
  local old
  if oldId then
   local oldRaw = redis.call('HGET', KEYS[4], oldId)
   if oldRaw then
    old = cjson.decode(oldRaw)
    local votes = {}
    for _,id in ipairs(old.votes or {}) do if id ~= d.userId then table.insert(votes,id) end end
    old.votes = votes
   end
  end
  local ownRaw = redis.call('HGET', KEYS[4], d.userId)
  local own = ownRaw and cjson.decode(ownRaw) or nil
  target.votes = target.votes or {}
  local found = false
  for _,id in ipairs(target.votes) do if id == d.userId then found=true end end
  if not found then table.insert(target.votes,d.userId) end
  if own then own.voted=true end
  -- Finish all JSON encoding before mutating game data.
  local targetJson = encode(target)
  local oldJson = old and encode(old) or nil
  local ownJson = own and encode(own) or nil
  if oldJson then redis.call('HSET',KEYS[4],oldId,oldJson) end
  redis.call('HSET',KEYS[4],p.votedUserId,targetJson)
  if ownJson then redis.call('HSET',KEYS[4],d.userId,ownJson) end
  redis.call('HSET',KEYS[6],d.userId,p.votedUserId)
 elseif d.kind == 'ACRONYM' then
  if redis.call('SISMEMBER',KEYS[5],p.answer)==1 then return reject('Answer already entered') end
  local oldRaw=redis.call('HGET',KEYS[4],d.userId)
  local old=oldRaw and cjson.decode(oldRaw) or nil
  local encoded=encode(p)
  if old then redis.call('SREM',KEYS[5],old.answer) end
  redis.call('SADD',KEYS[5],p.answer)
  redis.call('HSET',KEYS[4],d.userId,encoded)
 elseif d.kind == 'WORDMAKER' then
  if redis.call('HEXISTS',KEYS[7],p.answer)==1 then return reject('Guess already entered') end
  local answer=p.answer
  local guess=cjson.encode({timer=p.timer,text=answer})
  p.answer=''
  local encoded=encode(p)
  if redis.call('HEXISTS',KEYS[4],d.userId)==0 then redis.call('HSET',KEYS[4],d.userId,encoded) end
  redis.call('HSET',KEYS[7],answer,guess)
 else
  redis.call('HSET',KEYS[4],d.userId,encode(p))
 end
end
local result=cjson.encode({state='APPLIED'})
redis.call('SET',KEYS[1],result)
return result
`;
