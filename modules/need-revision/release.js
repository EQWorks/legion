const axios = require('axios')

const { SERVICES, CLIENTS } = require('../lib/products')
const { userInGroup, invokeSlackWorker, errMsg } = require('../lib/util')

const { GITHUB_USER = 'woozyking', GITHUB_TOKEN, DEPLOYED = false } = process.env

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: { accept: 'application/vnd.github.v3+json' },
  auth: {
    username: GITHUB_USER,
    password: GITHUB_TOKEN,
  },
})
// from the official semver documentation, with the addition of an optional 'v' in front
// https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const SEMVER_MATCH = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
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

const isVersioned = (repo) => VERSIONED.includes(repo.toLowerCase())

const getNextVersion = async ({ repo, stage = 'dev' }) => {
  const { data: { tag_name } } = await github({
    method: 'get',
    url: `/repos/EQWorks/${repo}/releases/latest`,
  })
  if (!isVersioned(repo) && (!SEMVER_MATCH.test(tag_name) || !Object.keys(VER_POS).includes(stage))) {
    return `${stage}-${new Date().toISOString().replace(/(-|:|T)/g, '').slice(0, 12)}`
  }
  // semver ones
  const latest = tag_name.replace(/[^0-9.]/g, '').split('.').map(Number) // extract semver x.y.z
  latest[VER_POS[stage]] += 1
  return `v${latest.join('.')}`
}

const isPre = ({ repo, stage = 'dev' }) => !isVersioned(repo) && stage.toLowerCase() === 'dev'

const formatRepoStage = ({ repo, stage }) => isVersioned(repo) ? repo : `${repo} (${stage || 'unknown stage'})`

const worker = async ({ repo, stage = 'dev', response_url }) => {
  const r = {
    response_type: 'ephemeral',
    text: `${formatRepoStage({ repo, stage })} cannot be released`,
  }
  const tag_name = await getNextVersion({ repo, stage })
  const repoTag = `${repo} (${tag_name})`
  try {
    const { data = {} } = await github({
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
      r.response_type = 'in_channel'
    }
  } catch (err) {
    console.error(err)
    r.text = `Fail to release ${repoTag}:\n${errMsg(err)}`
  }
  return axios.post(response_url, { replace_original: false, ...r })
}

const route = (req, res) => {
  const { user_id, text, response_url } = req.body // extract payload from slash command
  const [repo, stage] = text.trim().split(/\s+/) // parse out repo[, stage or semver-severity]
  const { groups = [] } = SERVICES[repo] || CLIENTS[repo] || {} // slack usergroups allowed to release
  const repoStage = formatRepoStage({ repo, stage })

  return userInGroup({ user_id, groups }).then((isUserInGroup) => {
    if (!isUserInGroup) {
      return res.status(200).json({ response_type: 'ephemeral', text: `You cannot release ${repoStage}` })
    }

    const payload = { repo, stage, response_url }
    if (DEPLOYED) {
      return invokeSlackWorker({ type: 'release', payload })
    }
    worker(payload).catch(console.error) // run in async (no return) for local worker
  }).then(() => res.status(200).json({
    response_type: 'in_channel',
    text: `<@${user_id}> is releasing ${repoStage}...`,
  })).catch((err) => {
    console.warn(`Request: ${req.body}`)
    console.error(err)
    return res.status(200).json({ response_type: 'ephemeral', text: `Fail to release ${repoStage}:\n${errMsg(err)}` })
  })
}

module.exports = { worker, route }
