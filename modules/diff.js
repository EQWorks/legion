const axios = require('axios')
const NetlifyAPI = require('netlify')
const { gCalendarGetEvents} = require('../google-api/googleapis')

const { userInGroup, invokeSlackWorker, errMsg } = require('./util')

const { GITHUB_TOKEN, COMMIT_LIMIT = 50 - 2, NETLIFY_TOKEN, DEPLOYED = false } = process.env


// TODO: only supports 2-stage comparison for now
const SERVICES = {
  overseer: {
    baseURL: 'httsp://api.eqworks.io',
    stages: ['dev', 'beta'],
    key: 'OVERSEER_VER',
    groups: ['flashteam', 'overlordteam', 'overseerteam'],
  },
  firstorder: {
    baseURL: 'https://api.locus.place',
    stages: ['dev', 'prod'],
    key: 'API_VER',
    groups: ['firstorderteam', 'snoketeam'],
  },
  keywarden: {
    baseURL: 'https://auth.eqworks.io',
    stages: ['dev', 'prod'],
    key: 'KEYWARDEN_VER',
    groups: ['flashteam', 'overlordteam', 'overseerteam', 'firstorderteam', 'snoketeam'],
  },
}
const CLIENTS = {
  overlord: {
    siteId: 'overlord.eqworks.io',
    stages: ['master', 'prod'],
    head: 'master',
    groups: ['flashteam', 'overlordteam', 'overseerteam'],
  },
  snoke: {
    siteId: 'console.locus.place',
    stages: ['dev', 'prod'],
    head: 'master',
    groups: ['firstorderteam', 'snoketeam'],
  },
}

const mayBreak = (message) => ['break', 'incompat'].some((p) => message.toLowerCase().includes(p))

const getGitDiff = async ({ product, base, head = 'master', dev, prod }) => {
  if (base === head) {
    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${product}* \`${dev}\` and \`${prod}\` are on the same commit (\`${base.slice(0, 7)}\`)`,
          }
        },
      ],
    }
  }

  const { data: { commits, status, html_url } } = await axios.get(
    `/repos/EQWorks/${product}/compare/${base}...${head}`,
    {
      baseURL: 'https://api.github.com',
      auth: {
        username: 'woozyking',
        password: GITHUB_TOKEN,
      },
    }
  )

  const contributors = new Set([])
  const breaking = new Set([])
  const noMerges = commits.filter(({ parents }) => parents.length <= 1).map(({
    sha,
    html_url,
    commit: { message, author, committer },
  }) => {
    const { name = '`Unknown`' } = (author || committer || {})
    contributors.add(name) // add to contributors set
    // highlight commits that may indicate breaking changes
    let msg = message
    if (mayBreak(message)) {
      msg = `*${message}*`
      breaking.add(sha)
    }
    return {
      type: 'section',
      text: { type: 'mrkdwn', text: `${msg} (<${html_url}|${sha.slice(0, 7)}> by ${name})` },
    }
  })
  noMerges.reverse()
  const limited = noMerges.length > (COMMIT_LIMIT) ? noMerges.slice(0, (COMMIT_LIMIT)) : noMerges
  const demos = await gCalendarGetEvents()
  const r = {
    response_type: 'in_channel',
    attachments: [
      {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${product}* \`${dev}\` is ${status} by ${limited.length} commits compared to \`${prod}\``,
            },
          },
          { type: 'divider' },
          ...limited,
        ],
      },
    ],
  }
  // highlight contributors
  if (contributors.size > 1) {
    r.attachments[0].blocks[0].text.text += `\n\nContributors: ${Array.from(contributors).join(', ')}`
  }

  // link to demos calendar
  if (demos) {
    const {day, link, events } = demos
    r.attachments[0].blocks[0].text.text += `\n\n*Demos* on <${link}|${day}>`
    events.forEach(({ timeSloth }) => {
      r.attachments[0].blocks[0].text.text += `\n\t• ${timeSloth}`
    })
  }
  // indicate potential breaking changes
  if (breaking.size) {
    r.attachments[0].color = '#FF0000'
    r.attachments[0].blocks[0].text.text += `\n\n*May contain ${breaking.size} breaking changes!*`
  }
  // add extra info to indicate that there are more commits than COMMIT_LIMIT
  if (limited.length < noMerges.length) {
    r.attachments[0].blocks[0].text.text += `\n\n${limited.length}/${noMerges.length} most recent commits shown below`
    r.attachments[0].blocks[0].accessory = {
      type: 'button',
      text: { type: 'plain_text', text: 'All Changes' },
      url: html_url,
      value: `${base}...${head}`,
    }
  }
  return r
}

const getServiceMeta = async (product) => {
  const { baseURL = '', stages = [], key } = SERVICES[product] || {}
  const [dev, prod] = stages
  const responses = await Promise.all(stages.map((stage) => axios.get(`/${stage}`, {
    baseURL,
    headers: { 'eq-api-jwt': 'public' },
  })))
  const [head, base] = responses.map(({ data = {} }) => data[key])

  return { head, base, dev, prod }
}

const getClientMeta = async (product) => {
  const { siteId = '', stages = [], head = 'master' } = CLIENTS[product] || {}
  const [dev, prod] = stages

  const netlify = new NetlifyAPI(NETLIFY_TOKEN)
  const { published_deploy: { commit_ref: base = '' } = {} } = await netlify.getSite({ siteId })

  if (!base) {
    throw new Error(`${product} has not been published on Netlify`)
  }

  return { head, base, dev, prod }
}

const worker = async ({ product, response_url }) => {
  let r = {
    response_type: 'ephemeral',
    text: `Sorry, product ${product} not found`,
  }

  if (Object.keys(SERVICES).includes(product)) {
    r = await getGitDiff({ product, ...await getServiceMeta(product) })
  } else if (Object.keys(CLIENTS).includes(product)) {
    r = await getGitDiff({ product, ...await getClientMeta(product) })
  }

  return axios.post(response_url, { replace_original: true, ...r })
}

const route = (req, res) => {
  const { user_id, text: _product, response_url } = req.body // extract payload from slash command
  const product = _product || 'firstorder'
  const payload = { product, response_url }
  const { groups = [] } = SERVICES[product] || CLIENTS[product] || {}

  return userInGroup({ user_id, groups }).then((can) => {
    if (!can) {
      return res.status(200).json({ response_type: 'ephemeral', text: `You cannot diff ${product}` })
    }
    if (!DEPLOYED) {
      worker(payload).catch(console.error)
      return
    }
    return invokeSlackWorker({ type: 'diff', payload })
  }).then(() => res.status(200).json({
    response_type: 'ephemeral',
    text: `Diffing for ${product}...`,
  })).catch((err) => {
    console.error(err)
    return res.status(200).json({ response_type: 'ephemeral', text: `Failed to diff:\n${errMsg(err)}` })
  })
}

module.exports = { worker, route }
