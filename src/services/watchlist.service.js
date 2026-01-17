import WatchlistItem from '../models/watchlistItem.model.js';
import redisClient from '../config/redis.js';

const REDIS_DEFAULT_KEY = 'default:watchlist:v1';
const REDIS_USER_KEY = (userId) => `user:watchlist:v1:${String(userId)}`;

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const normalizeName = (value) => String(value || '').trim();

const parseLimit = (value) => {
  const limitRaw = Number(value || 50);
  return Math.min(Math.max(limitRaw, 1), 200);
};

const isRedisReady = () => {
  try {
    return Boolean(redisClient && redisClient.isOpen === true);
  } catch (error) {
    return false;
  }
};

const getRedisJSON = async (key) => {
  if (!isRedisReady()) return null;

  const raw = await redisClient.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const setRedisJSON = async (key, value, ttlSeconds) => {
  if (!isRedisReady()) return;

  const payload = JSON.stringify(value);

  if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
    await redisClient.setEx(key, ttlSeconds, payload);
    return;
  }

  await redisClient.set(key, payload);
};

const delRedis = async (key) => {
  if (!isRedisReady()) return;
  await redisClient.del(key);
};

export const watchlistService = {
  parseLimit,
  normalizeCode,
  normalizeName,

  // -------------------------
  // DEFAULT WATCHLIST (REDIS)
  // -------------------------

  async getDefaultList() {
    const list = await getRedisJSON(REDIS_DEFAULT_KEY);

    if (!Array.isArray(list)) return [];

    return list
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        code: normalizeCode(x.code),
        name: normalizeName(x.name),
      }))
      .filter((x) => x.code && x.name);
  },

  async addDefaultItem(payload) {
    const code = normalizeCode(payload?.code);
    const name = normalizeName(payload?.name);

    if (!code) return { error: { status: 400, message: 'Code is required' } };
    if (!name) return { error: { status: 400, message: 'Name is required' } };

    if (code.length > 30) return { error: { status: 400, message: 'Code is too long' } };
    if (name.length > 60) return { error: { status: 400, message: 'Name is too long' } };

    const list = await this.getDefaultList();

    const exists = list.find((x) => x.code === code);

    if (exists) {
      const updated = list.map((x) => (x.code === code ? { code, name } : x));
      await setRedisJSON(REDIS_DEFAULT_KEY, updated, 0);
      return { data: updated, message: 'Default item updated' };
    }

    const updated = [{ code, name }, ...list];
    await setRedisJSON(REDIS_DEFAULT_KEY, updated, 0);

    return { data: updated, message: 'Default item added' };
  },

  async removeDefaultItem(codeRaw) {
    const code = normalizeCode(codeRaw);
    if (!code) return { error: { status: 400, message: 'Code is required' } };

    const list = await this.getDefaultList();
    const updated = list.filter((x) => x.code !== code);

    await setRedisJSON(REDIS_DEFAULT_KEY, updated, 0);

    return { data: updated, message: 'Default item removed' };
  },

  // -------------------------
  // USER DEFAULT SEEDING
  // -------------------------

  async ensureDefaultForUser(userId) {
    const total = await WatchlistItem.countDocuments({
      userId,
      isAdded: true,
      isEnable: true,
    });

    if (total > 0) return;

    const defaultList = await this.getDefaultList();
    if (defaultList.length === 0) return;

    const ops = defaultList.map((item) => ({
      updateOne: {
        filter: { userId, code: item.code },
        update: {
          $setOnInsert: {
            userId,
            code: item.code,
            name: item.name,
            isAdded: true,
            isEnable: true,
          },
        },
        upsert: true,
      },
    }));

    await WatchlistItem.bulkWrite(ops, { ordered: false });

    // clear cache
    await delRedis(REDIS_USER_KEY(userId));
  },

  // -------------------------
  // USER WATCHLIST (CACHE)
  // -------------------------

  async getUserWatchlist(userId, limit) {
    const cached = await getRedisJSON(REDIS_USER_KEY(userId));
    if (Array.isArray(cached)) {
      return cached.slice(0, limit);
    }

    const items = await WatchlistItem.find({
      userId,
      isAdded: true,
      isEnable: true,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select('_id code name isAdded isEnable createdAt updatedAt');

    // cache for 15 seconds
    await setRedisJSON(REDIS_USER_KEY(userId), items, 15);

    return items;
  },

  async getOne(userId, codeRaw) {
    const code = normalizeCode(codeRaw);
    if (!code) return { error: { status: 400, message: 'Code is required' } };

    const item = await WatchlistItem.findOne({ userId, code }).select(
      '_id code name isAdded isEnable createdAt updatedAt'
    );

    if (!item) {
      return { error: { status: 404, message: 'Item not found in watchlist' } };
    }

    return { data: item };
  },

  async addUserItem(userId, payload) {
    const code = normalizeCode(payload?.code);
    const name = normalizeName(payload?.name);

    if (!code) return { error: { status: 400, message: 'Code is required' } };
    if (!name) return { error: { status: 400, message: 'Name is required' } };

    if (code.length > 30) return { error: { status: 400, message: 'Code is too long' } };
    if (name.length > 60) return { error: { status: 400, message: 'Name is too long' } };

    try {
      const created = await WatchlistItem.create({
        userId,
        code,
        name,
        isAdded: true,
        isEnable: true,
      });

      await delRedis(REDIS_USER_KEY(userId));

      return {
        data: {
          _id: created._id,
          code: created.code,
          name: created.name,
          isAdded: created.isAdded,
          isEnable: created.isEnable,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      };
    } catch (error) {
      console.log('WATCHLIST ADD ERROR =>', error);

      // duplicate key
      if (error?.code === 11000) {
        const existing = await WatchlistItem.findOne({ userId, code }).select(
          '_id code name isAdded isEnable createdAt updatedAt'
        );

        if (existing) {
          // re-enable if disabled/removed
          if (existing.isAdded === false || existing.isEnable === false || existing.name !== name) {
            existing.isAdded = true;
            existing.isEnable = true;
            existing.name = name;
            await existing.save();
          }

          await delRedis(REDIS_USER_KEY(userId));

          return { data: existing, alreadyExists: true };
        }

        return { error: { status: 409, message: 'Already in watchlist' } };
      }

      return { error: { status: 500, message: 'Failed to add watchlist item' } };
    }
  },

  async removeUserItem(userId, codeRaw) {
    const code = normalizeCode(codeRaw);
    if (!code) return { error: { status: 400, message: 'Code is required' } };

    const updated = await WatchlistItem.findOneAndUpdate(
      { userId, code },
      { $set: { isAdded: false } },
      { new: true }
    ).select('_id code name isAdded isEnable createdAt updatedAt');

    if (!updated) {
      return { error: { status: 404, message: 'Item not found in watchlist' } };
    }

    await delRedis(REDIS_USER_KEY(userId));

    return { data: updated };
  },
};
