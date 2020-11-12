const axios = require('axios')

const { GITHUB_TOKEN } = process.env


const BASE_OPTS = {
  baseURL: 'https://api.github.com',
  auth: {
    username: 'woozyking',
    password: GITHUB_TOKEN,
  },
}
const VERSIONED = ['snoke', 'overlord']

const isVersioned = (repo) => VERSIONED.includes(repo.toLowerCase())

const getNextVersion = async ({ repo, stage = 'dev', sem = 'z' }) => {
  if (!isVersioned(repo)) {
    return `${stage}-${new Date().toISOString().replace(/(-|:|T)/g, '').slice(0, 12)}`
  }
  // semver ones
  const { data: { tag_name } } = await axios({
    ...BASE_OPTS,
    method: 'get',
    url: `/repos/EQWorks/${repo}/releases/latest`,
  })
  const latest = tag_name.replace(/[^0-9.]/g, '').split('.').map(Number) // extract semver x.y.z
  latest[['x', 'y', 'z'].indexOf(sem)] += 1
  latest[['major', 'minor', 'patch'].indexOf(sem)] += 1
  return latest.join('.')
}

const isPre = ({ repo, stage = 'dev' }) => !isVersioned(repo) && stage.toLowerCase() === 'dev'

const worker = async ({ repo, stage = 'dev', sem = 'z' }) => {
  const { data } = await axios({
    ...BASE_OPTS,
    method: 'post',
    url: `/repos/EQWorks/${repo}/releases`,
    data: {
      tag_name: getNextVersion({ repo, stage, sem }),
      prerelease: isPre({ repo, stage }),
    },
  })
  return data
}

const route = (req, res) => {
  //
}

if (require.main === module) {
  getNextVersion({ repo: 'firstorder' }).then(console.log)
}
