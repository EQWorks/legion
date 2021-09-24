const { Deta } = require('deta')

const { getSpecificGroupIds } = require('./util')

// TODO: only supports 2-stage comparison for now
module.exports.SERVICES = {
  overseer: {
    baseURL: 'httsp://api.eqworks.io',
    stages: ['dev', 'beta'],
    key: 'OVERSEER_VER',
    groups: getSpecificGroupIds(['flashteam', 'overseerteam', 'overlordteam'])
  },
  firstorder: {
    baseURL: 'https://api.locus.place',
    stages: ['dev', 'prod'],
    key: 'API_VER',
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam'])
  },
  keywarden: {
    baseURL: 'https://auth.eqworks.io',
    stages: ['dev', 'prod'],
    key: 'KEYWARDEN_VER',
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam', 'flashteam', 'overseerteam', 'overlordteam'])
  },
}

module.exports.CLIENTS = {
  overlord: {
    siteId: 'overlord.eqworks.io',
    stages: ['master', 'prod'],
    groups: getSpecificGroupIds(['flashteam', 'overseerteam', 'overlordteam'])
  },
  snoke: {
    siteId: 'console.locus.place',
    stages: ['dev', 'prod'],
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam'])
  },
}

module.exports.getSetLock = (dbName) => async ({ user_id, channel, product }) => {
  if (!process.env.DETA_KEY) {
    return true
  }
  const deta = Deta(process.env.DETA_KEY)
  const db = deta.Base(dbName)
  const key = `${channel}::${product}`
  const exists = await db.get(key)
  if (exists) {
    return { ...exists, locked: true }
  }
  return await db.put({
    timestamp: new Date(),
    user_id,
    channel,
    product,
  }, key)
}

module.exports.releaseLock = (dbName) => ({ channel, product }) => {
  if (!process.env.DETA_KEY) {
    return
  }
  const deta = Deta(process.env.DETA_KEY)
  const db = deta.Base(dbName)
  const key = `${channel}::${product}`
  return db.delete(key) // returns null regardless
}
