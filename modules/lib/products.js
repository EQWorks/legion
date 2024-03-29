const { Deta } = require('deta')

const { getSpecificGroupIds } = require('./util')

// product bundles
module.exports.BUNDLES = {
  atom: ['overseer', 'overlord'],
  locus: ['firstorder', 'snoke'],
  notebook: ['firstorder', 'enrichdata', 'locussdk', 'jupyterhub'],
}

// TODO: only supports 2-stage comparison for now
module.exports.SERVICES = {
  overseer: {
    baseURL: 'https://api.eqworks.io',
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
    siteId: 'overlord.eqworks.io', // netlify site ID, also the main domain
    projectId: 'prj_qgapSHRWtoi5pUdGrHFXns2qFljX', // vercel project ID
    stages: ['master', 'prod'],
    groups: getSpecificGroupIds(['flashteam', 'overseerteam', 'overlordteam'])
  },
  snoke: {
    siteId: 'console.locus.place', // netlify site ID, also the main domain
    projectId: 'prj_TqFdYCSg60gcDJnnfeJ68bb7wPiy', // vercel project ID
    stages: ['dev', 'prod'],
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam'])
  },
  'cox-dashboard': { // same as paymi-dashboard, just a different stage/branch
    repo: 'snoke-dashboard', // by default uses the CLIENTS[key], but use repo value if available
    projectId: 'prj_V3ecJ0BYs8VTQyn7EYBcbtZOhQ4U', // vercel project ID
    stages: ['main', 'v1/cox'],
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam'])
  },
  'paymi-dashboard': { // same as paymi-dashboard, just a different stage/branch
    repo: 'snoke-dashboard', // by default uses the CLIENTS[key], but use repo value if available
    projectId: 'prj_V3ecJ0BYs8VTQyn7EYBcbtZOhQ4U', // vercel project ID
    stages: ['main', 'v1/paymi'],
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam'])
  },
}

module.exports.getKey = ({ channel, product, timestamp = new Date(), tsFloor = 1000 * 60 * 5 }) => {
  let key = `${channel}::${product}`
  if (tsFloor > 0) {
    const rounded = new Date(Math.floor(timestamp.getTime() / tsFloor) * tsFloor)
    // in the form of YYYYMMDDHHmm 202110041615
    key += `::${rounded.toISOString().split('.')[0].replace(/[^0-9]/g, '')}`
  }
  return key
}

module.exports.getSetLock = (dbName) => async ({
  user_id,
  channel,
  product,
  timestamp = new Date(),
  key = this.getKey({ channel, product, timestamp }),
  hard = true,
}) => {
  if (!process.env.DETA_KEY) {
    return true
  }
  const deta = Deta(process.env.DETA_KEY)
  const db = deta.Base(dbName)
  const payload = { timestamp, user_id, channel, product }
  if (hard) { // use deta.Base.insert to force error if already exists
    return await db.insert(payload, key).catch(() => ({ ...payload, key, hard, locked: true }))
  }
  const exists = await db.get(key)
  if (exists) {
    return { ...exists, locked: true }
  }
  return await db.put(payload, key, { expireAt: new Date(timestamp.getTime() + 1000 * 60 * 5) })
}

module.exports.releaseLock = (dbName) => (key) => {
  if (!process.env.DETA_KEY) {
    return
  }
  const deta = Deta(process.env.DETA_KEY)
  const db = deta.Base(dbName)
  return db.delete(key) // return null regardless, currently buggy
}
