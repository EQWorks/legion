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
    head: 'master',
    groups: getSpecificGroupIds(['flashteam', 'overseerteam', 'overlordteam'])
  },
  snoke: {
    siteId: 'console.locus.place',
    stages: ['dev', 'prod'],
    head: 'master',
    groups: getSpecificGroupIds(['firstorderteam', 'snoketeam'])
  },
}
