const axios = require('axios')
const NetlifyAPI = require('netlify')
const { gCalendarGetEvents } = require('../google-api/googleapis')
const { parseCommits } = require('@eqworks/release')

const { userInGroup, invokeSlackWorker, errMsg } = require('./util')

const { GITHUB_TOKEN, NETLIFY_TOKEN, DEPLOYED = false } = process.env


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

  const { data: { commits, status } } = await axios.get(
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
  const noMerges = commits
    .filter(({ parents }) => parents.length <= 1)
    .reverse()
    .map(({ sha, html_url, commit }) => ({ sha, html_url, commit }))
  const logs = noMerges.map(({
    sha,
    commit: { message, author, committer },
    html_url,
  }) => {
    // %h::%s::%b::%an||
    const [s, ...b] = message.split('\n')
    const { name: an = '`Unknown`' } = (author || committer || {})
    contributors.add(an) // side-effect to populate contributors
    return [`<${html_url}|${sha.slice(0, 7)}>`, s, b.join('\n'), an].join('::')
  })
  const parsed = (await parseCommits({ logs })).reduce((acc, { labels: [label], t1, msg: { s, t2 } }) => {
    acc[label] = acc[label] || []
    acc[label].push(`${[t1, t2].filter(t => t).join('/')} - ${s}`)
    return acc
  }, {})
  // TODO: need to extend release formatter to support slack blocks mrkdwn format too
  // const formatted = formatChangelog({ parsed, version: head.slice(0, 7), previous: base.slice(0, 7) })
  let formatted = `*Changelog: from ${base.slice(0, 7)} to ${head.slice(0, 7)}*\n`
  Object.entries(parsed).forEach(([label, items]) => {
    formatted += `\n*${label}*\n`
    items.forEach((item) => {
      formatted += `* ${item}\n`
    })
  })
  const hasBreaking = mayBreak(formatted)
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
              text: `*${product}* \`${dev}\` is ${status} by ${noMerges.length} commits compared to \`${prod}\``,
            },
          },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: formatted } },
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
    const { day, link, events } = demos
    r.attachments[0].blocks[0].text.text += `\n\n*Demos* on <${link}|${day}>`
    events.forEach(({ timeSlot }) => {
      r.attachments[0].blocks[0].text.text += `\n\t• ${timeSlot}`
    })
  }
  // indicate potential breaking changes
  if (hasBreaking) {
    r.attachments[0].color = '#FF0000'
    r.attachments[0].blocks[0].text.text += '\n\n*May contain breaking changes!*'
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
