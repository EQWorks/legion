const axios = require('axios')
const NetlifyAPI = require('netlify')
const { parseCommits } = require('@eqworks/release')

// const { gCalendarGetEvents } = require('../lib/googleapis')
const { BUNDLES, SERVICES, CLIENTS, getSetLock, releaseLock, getKey } = require('../lib/products')
const { userInGroup, invokeSlackWorker, getChannelName, getSpecificGroupIds } = require('../lib/util')

const { GITHUB_TOKEN, COMMIT_LIMIT = 5, NETLIFY_TOKEN, GITHUB_ORG = 'EQWorks', GITHUB_USER = 'woozyking' } = process.env

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: { accept: 'application/vnd.github.v3+json' },
  auth: {
    username: GITHUB_USER,
    password: GITHUB_TOKEN,
  },
})

const mayBreak = (message) => ['break', 'incompat'].some((p) => message.toLowerCase().includes(p))

const getGitDiff = async ({ product, base, head = 'master', dev, prod }) => {
  const { data: { commits, status } } = await github.get(`/repos/${GITHUB_ORG}/${product}/compare/${base}...${head}`)

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
  // TODO: needs rework
  // try {
  //   demos = await gCalendarGetEvents()
  // } catch (err) {
  //   console.warn('Failed to obtain demo calendar events')
  //   console.error(err)
  // }
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
    throw new Error(`\`${product}\` has not been published on Netlify`)
  }
  // get default branch as head
  const { data: { default_branch } } = await github.get(`/repos/${GITHUB_ORG}/${product}`)

  return { head: default_branch, base, dev, prod }
}

const getSetDiffLock = getSetLock('diff_lock')
const releaseDiffLock = releaseLock('diff_locks')

// individual product/github repo diff
const getDiff = async (product) => {
  let r = {
    response_type: 'ephemeral',
    text: `Sorry, product ${product} not found`,
  }
  if (Object.keys(SERVICES).includes(product)) {
    r = await getGitDiff({ product, ...await getServiceMeta(product) })
  } else if (Object.keys(CLIENTS).includes(product)) {
    r = await getGitDiff({ product, ...await getClientMeta(product) })
  } else {
    // get repo metadata and latest tag/release
    const [meta, release] = await Promise.all([
      github.get(`/repos/${GITHUB_ORG}/${product}`).then(({ data }) => data).catch(() => ({})),
      github.get(`/repos/${GITHUB_ORG}/${product}/releases/latest`).then(({ data }) => data).catch(() => ({})),
    ])
    const { default_branch: head } = meta // head is also dev in this case
    if (!head) {
      return { ...r, text: `\`${product}\` is not found on GitHub` }
    }
    const { tag_name: prod } = release
    if (!prod) {
      return { ...r, text: `\`${product}\` has not been released on GitHub` }
    }
    // get latest release tag's commit hash as base
    const { data: { object: { sha: base } } } = await github.get(`/repos/${GITHUB_ORG}/${product}/git/ref/tags/${prod}`)
    r = await getGitDiff({ product, head, base, dev: head, prod })
  }
  return r
}

const worker = async ({
  channel,
  product,
  key = getKey({ channel, product }),
  response_url,
}) => {
  if (BUNDLES[product]) {
    const rs = await Promise.all(BUNDLES[product].map(getDiff))
    await releaseDiffLock(key)
    return Promise.all(rs.map((r) => axios.post(response_url, r)))
  }

  const r = await getDiff(product)
  await releaseDiffLock(key)
  return axios.post(response_url, r)
}

const listener = async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack()
  // preliminary check if the product can be diff'ed
  const { text: _product, channel_name, channel_id, user_id, response_url } = command
  const { name: channel, id: ci } = await getChannelName({ channel_name, channel_id})
  const products = [...Object.keys(SERVICES), ...Object.keys(CLIENTS)]
  const product = _product.toLowerCase() || (products.includes(channel) ? channel : 'firstorder')
  // get Slack group IDs, default to the @product-group's
  const { groups = getSpecificGroupIds(['product-group']) } = SERVICES[product] || CLIENTS[product] || {}
  // check if user is in the group
  const isUserInGroup = await userInGroup({ user_id, groups })
  if (!isUserInGroup) {
    await respond(`You cannot diff ${product}`)
    return
  }
  // check deta.Base('diff_lock')
  const timestamp = new Date()
  const key = getKey({ channel, product, timestamp })
  const { locked, ...lockMeta } = await getSetDiffLock({ user_id, channel, product, key, timestamp, hard: false })
  if (locked) {
    await respond(`Diffing for \`${product}\` in <#${ci}> in progress, initiated by <@${lockMeta.user_id}> at ${lockMeta.timestamp}`)
    return
  }
  // asynchronously invoke worker
  const payload = { channel, product, key, response_url }
  await invokeSlackWorker({ type: 'diff', payload })
  // respond immediately
  await respond(`Diffing for ${product}...`)
}

module.exports = { worker, listener, github }
