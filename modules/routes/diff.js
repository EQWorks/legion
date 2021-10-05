const axios = require('axios')
const NetlifyAPI = require('netlify')
const { parseCommits } = require('@eqworks/release')

const { gCalendarGetEvents } = require('../lib/googleapis')
const { SERVICES, CLIENTS, getSetLock, releaseLock, getKey } = require('../lib/products')
const { userInGroup, invokeSlackWorker, errMsg, getChannelName } = require('../lib/util')

const { GITHUB_TOKEN, COMMIT_LIMIT = 5, NETLIFY_TOKEN, DEPLOYED = false } = process.env

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: { accept: 'application/vnd.github.v3+json' },
  auth: {
    username: 'woozyking',
    password: GITHUB_TOKEN,
  },
})

const mayBreak = (message) => ['break', 'incompat'].some((p) => message.toLowerCase().includes(p))

const getGitDiff = async ({ product, base, head = 'master', dev, prod }) => {
  const { data: { commits, status } } = await github.get(`/repos/EQWorks/${product}/compare/${base}...${head}`)

  if (!commits.length) {
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
    items.slice(0, COMMIT_LIMIT).forEach((item) => {
      formatted += `• ${item}\n`
    })
    if (items.length > COMMIT_LIMIT) {
      formatted += `• ${items.length - COMMIT_LIMIT} more...\n`
    }
  })
  const hasBreaking = mayBreak(formatted)
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
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: `(${product}) % npx @eqworks/release changelog --base ${base.slice(0, 7)} --head ${head.slice(0, 7)}`,
            }],
          },
        ],
      },
    ],
  }
  // highlight contributors
  if (contributors.size > 1) {
    r.attachments[0].blocks[0].text.text += `\n\nContributors: ${Array.from(contributors).join(', ')}`
  }
  // link to demos calendar
  let demos = null
  try {
    demos = await gCalendarGetEvents()
  } catch (err) {
    console.warn('Failed to obtain demo calendar events')
    console.error(err)
  }
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
  const { siteId = '', stages = [] } = CLIENTS[product] || {}
  const [dev, prod] = stages

  const netlify = new NetlifyAPI(NETLIFY_TOKEN)
  const { published_deploy: { commit_ref: base = '' } = {} } = await netlify.getSite({ siteId })

  if (!base) {
    throw new Error(`${product} has not been published on Netlify`)
  }
  // get default branch as head
  const { data: { default_branch } } = await github.get(`/repos/EQWorks/${product}`)

  return { head: default_branch, base, dev, prod }
}

const getSetDiffLock = getSetLock('diff_lock')
const releaseDiffLock = releaseLock('diff_locks')

const worker = async ({ channel, product, response_url }) => {
  let r = {
    response_type: 'ephemeral',
    text: `Sorry, product ${product} not found`,
  }

  if (Object.keys(SERVICES).includes(product)) {
    r = await getGitDiff({ product, ...await getServiceMeta(product) })
  } else if (Object.keys(CLIENTS).includes(product)) {
    r = await getGitDiff({ product, ...await getClientMeta(product) })
  }
  releaseDiffLock(getKey({ channel, product })) // no need to await as it releases regardless
  return axios.post(response_url, { replace_original: false, ...r })
}

const route = (req, res) => {
  const { user_id, text: _product, response_url } = req.body // extract payload from slash command
  let product
  let channel
  return getChannelName(req.body).then((cn) => {
    const products = [...Object.keys(SERVICES), ...Object.keys(CLIENTS)]
    product = _product || (products.includes(cn) ? cn : 'firstorder')
    channel = cn
    const { groups = [] } = SERVICES[product] || CLIENTS[product] || {}
    return userInGroup({ user_id, groups })
  }).then((isUserInGroup) => {
    if (!isUserInGroup) {
      return res.status(200).json({ response_type: 'ephemeral', text: `You cannot diff ${product}` })
    }
    return getSetDiffLock({ user_id, channel, product, hard: false })
  }).then(({ locked, ...lockMeta }) => {
    if (locked) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: `Diffing for ${product} in ${channel} in progress, initiated by ${lockMeta.user_id} at ${lockMeta.timestamp}`,
      })
    }
    const payload = { channel, product, response_url }
    if (DEPLOYED) {
      return invokeSlackWorker({ type: 'diff', payload })
    }
    worker(payload).catch(console.error) // run in async (no return) for local worker
  }).then(() => res.status(200).json({
    response_type: 'ephemeral',
    text: `Diffing for ${product}...`,
  })).catch((err) => {
    console.warn(`Request: ${req.body}`)
    console.error(err)
    return res.status(200).json({ response_type: 'ephemeral', text: `Failed to diff:\n${errMsg(err)}` })
  })
}

module.exports = { worker, route }
