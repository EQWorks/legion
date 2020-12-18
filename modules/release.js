const axios = require('axios')

const { userInGroup, invokeSlackWorker, errMsg } = require('./util')


const { GITHUB_USER = 'woozyking', GITHUB_TOKEN, DEPLOYED = false } = process.env

const BASE_OPTS = {
  baseURL: 'https://api.github.com',
  headers: { accept: 'application/vnd.github.v3+json' },
  auth: {
    username: GITHUB_USER,
    password: GITHUB_TOKEN,
  },
}
const VERSIONED = ['snoke', 'overlord']
const VER_POS = {
  'x': 0,
  'y': 1,
  'z': 2,
  'major': 0,
  'minor': 1,
  'patch': 2,
  'dev': 2,
}
const GROUPS = {
  snoke: ['firstorderteam', 'snoketeam'],
  firstorder: ['firstorderteam', 'snoketeam'],
  overlord: ['flashteam', 'overlordteam', 'overseerteam'],
  overseer: ['flashteam', 'overlordteam', 'overseerteam'],
}

const isVersioned = (repo) => VERSIONED.includes(repo.toLowerCase())

const getNextVersion = async ({ repo, stage = 'dev' }) => {
  if (!isVersioned(repo) && !Object.keys(VER_POS).includes(stage)) {
    return `${stage}-${new Date().toISOString().replace(/(-|:|T)/g, '').slice(0, 12)}`
  }
  // semver ones
  const { data: { tag_name } } = await axios({
    ...BASE_OPTS,
    method: 'get',
    url: `/repos/EQWorks/${repo}/releases/latest`,
  })
  const latest = tag_name.replace(/[^0-9.]/g, '').split('.').map(Number) // extract semver x.y.z
  latest[VER_POS[stage]] += 1
  return `v${latest.join('.')}`
}

const isPre = ({ repo, stage = 'dev' }) => !isVersioned(repo) && stage.toLowerCase() === 'dev'

const formatRepoStage = ({ repo, stage }) => isVersioned(repo) ? repo : `${repo} (${stage || 'unknown stage'})`

const worker = async ({ repo, stage = 'dev', response_url }) => {
  const r = {
    response_type: 'in_channel',
    text: `${formatRepoStage({ repo, stage })} cannot be released`,
  }
  const tag_name = await getNextVersion({ repo, stage })
  const repoTag = `${repo} (${tag_name})`
  try {
    const { data = {} } = await axios({
      ...BASE_OPTS,
      method: 'post',
      url: `/repos/EQWorks/${repo}/releases`,
      data: {
        tag_name,
        name: tag_name,
        prerelease: isPre({ repo, stage }),
      },
    })
    if (data.html_url) {
      r.text = `<${data.html_url}|${repoTag} released>`
    }
  } catch (err) {
    console.error(err)
    r.text = `Fail to release ${repoTag}:\n${errMsg(err)}`
  }
  return axios.post(response_url, { replace_original: true, ...r })
}

const route = (req, res) => {
  const { user_id, text, response_url } = req.body // extract payload from slash command
  const [repo, stage] = text.trim().split(/\s+/) // parse out repo[, stage or semver-severity]
  const groups = GROUPS[repo.toLowerCase()] // slack usergroups allowed to release
  const repoStage = formatRepoStage({ repo, stage })
  const response_type = 'ephemeral'
  return userInGroup({ user_id, groups }).then((can) => {
    if (!can) {
      return res.status(200).json({ response_type, text: `You cannot release ${repoStage}` })
    }
    const payload = { repo, stage, response_url }
    if (!DEPLOYED) {
      worker(payload).catch(console.error)
      return
    }
    return invokeSlackWorker({ type: 'release', payload })
  }).then(() => res.status(200).json({ response_type, text: `Releasing ${repoStage}...` })).catch((err) => {
    console.error(err)
    return res.status(200).json({ response_type, text: `Fail to release ${repoStage}:\n${errMsg(err)}` })
  })
}

module.exports = { worker, route }
