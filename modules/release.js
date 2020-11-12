const axios = require('axios')

const { userInGroup, invokeSlackWorker } = require('./util')


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

const worker = async ({ repo, stage = 'dev', response_url }) => {
  const r = {
    response_type: 'ephemeral',
    text: `${repo} (${stage}) cannot be released`,
  }
  const tag_name = await getNextVersion({ repo, stage })
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
      r.text = `<${data.html_url}|${repo} (${tag_name}) released>`
    }
  } catch (error) {
    r.text = `${repo} (${tag_name}) cannot be released:\n\`\`\`${error.toString()}\`\`\``
  }
  return axios.post(response_url, { replace_original: true, ...r })
}

const route = (req, res) => {
  const { user_id, text, response_url } = req.body
  const [repo, stage] = text.split(/\s+/)
  // get repo groups
  const groups = GROUPS[repo.toLowerCase()]
  const wip = {
    response_type: 'ephemeral',
    text: `Releasing ${repo}${stage ? ` (${stage})` : ''}...`,
  }
  return userInGroup({ user_id, groups }).then((can) => {
    if (!can) {
      return res.status(200).json({ response_type: 'ephemeral', text: `You cannot release ${repo}${stage ? ` (${stage})` : ''}` })
    }
    const payload = { repo, stage, response_url }
    if (!DEPLOYED) {
      worker(payload).catch(console.error)
      return
    }
    return invokeSlackWorker({ type: 'release', payload })
  }).then(() => res.status(200).json(wip)).catch((err) => {
    console.error(err)
    return res.status(200).json({ response_type: 'ephemeral', text: `Fail to release ${repo}${stage ? ` (${stage})` : ''}` })
  })
}

module.exports = { worker, route }
