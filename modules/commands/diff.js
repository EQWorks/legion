const axios = require('axios')
const { parseCommits, groupParsed } = require('@eqworks/release')

// const { gCalendarGetEvents } = require('../lib/googleapis')
const { BUNDLES, SERVICES, CLIENTS, getSetLock, releaseLock, getKey } = require('../lib/products')
const { userInGroup, invokeSlackWorker, getChannelName, getSpecificGroupIds } = require('../lib/util')

const { GITHUB_TOKEN, GITHUB_ORG = 'EQWorks', GITHUB_USER = 'woozyking', VERCEL_TOKEN, VERCEL_TEAM } = process.env

const BLOCKS_LIMIT = 50 // slack blocks limit
const TEXT_LIMIT = 3000 // slack text section blocks are limited to 3000 characters (actually 3001)
const FILLER = '\n_more..._'

const vercel = axios.create({
  baseURL: 'https://api.vercel.com',
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
})

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: { accept: 'application/vnd.github.v3+json' },
  auth: {
    username: GITHUB_USER,
    password: GITHUB_TOKEN,
  },
})

const mayBreak = (blocks) => blocks.some((b) => b.toLowerCase().includes('break') || b.toLowerCase().includes('incompat'))

const formatCommitBody = (grouped) => {
  const commits = []
  Object.entries(grouped).forEach(([label, items]) => {
    let block = `*${label}*`
    for (const { t1, t2, s, b } of items) {
      block += `\n• ${t1}${t2 ? `/${t2}` : ''} - ${s}`
      if (b) {
        block += `\n${b.split('\n').map(v => `> ${v}`).join('\n')}` // include body
      }
      if (block.length > TEXT_LIMIT) { // honor slack block text limit
        block = block.slice(0, TEXT_LIMIT - FILLER.length) + FILLER
      }
      commits.push(block)
      block = '' // same label, no need to repeat
    }
  })
  return commits
}

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

  const contributors = new Set([]) // TODO: incorporate release contributors reports
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
  const parsed = await parseCommits({ logs })
  const grouped = groupParsed(parsed, { by: 'labels' })
  const previous = base.slice(0, 7)
  const version = head.slice(0, 7)
  const commitBody = formatCommitBody(grouped)
  const hasBreaking = mayBreak(commitBody)
  const bodyBlocks = commitBody.map((b) => ({ type: 'section', text: { type: 'mrkdwn', text: b } }))
  let header = [
    `*${product}* \`${dev}\` is ${status} by ${noMerges.length} commits compared to \`${prod}\``,
    `*Contributors:* ${Array.from(contributors).join(', ')}`,
    `*Changelog (by label): from ${previous} to ${version}*`,
  ]
  let color = '#eeeeee'
  if (hasBreaking) {
    header.push('_May contain breaking changes!_')
    color = '#FF0000'
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
    header.push(`*Demos* on <${link}|${day}>`)
    events.forEach(({ timeSlot }) => {
      header.push(`\n\t• ${timeSlot}`)
    })
  }
  const blocks = [
    { // header block
      type: 'section',
      text: { type: 'mrkdwn', text: header.join('\n') },
    },
    ...bodyBlocks,
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `(${product}) % npx @eqworks/release changelog --base ${previous} --head ${version}`,
      }],
    },
  ]
  // dissect blocks into chunks of at most 50
  const chunks = []
  for (let i = 0; i < blocks.length; i += BLOCKS_LIMIT) {
    chunks.push(blocks.slice(i, i + BLOCKS_LIMIT))
  }
  return chunks.map((blocks) => ({
    response_type: 'in_channel',
    attachments: [{ color, blocks }],
  }))
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

const getVercelMeta = (product) => {
  const { projectId = '' } = CLIENTS[product] || {}
  return vercel.get('/v6/deployments', {
    params: {
      projectId,
      teamId: VERCEL_TEAM,
      target: 'production',
      limit: 1,
    }
  }).then(({ data: { deployments = [] } = {} }) => deployments[0] || {})
}

const getClientMeta = async (product) => {
  const { meta: { githubCommitSha: base = '' } = {} } = await getVercelMeta(product)

  if (!base) {
    throw new Error(`\`${product}\` has not been published on Vercel`)
  }
  // get default branch as head
  const { data: { default_branch } } = await github.get(`/repos/${GITHUB_ORG}/${product}`)

  const { stages = [] } = CLIENTS[product] || {}
  const [dev, prod] = stages

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
  return r // diff is an array of one or more chunks of up to 50 blocks
}

const worker = async ({
  channel,
  product,
  key = getKey({ channel, product }),
  response_url,
}) => {
  const rs = BUNDLES[product] ? await Promise.all(BUNDLES[product].map(getDiff)) : [await getDiff(product)]
  await releaseDiffLock(key)
  return Promise.all(rs.map(async (r) => {
    if (!Array.isArray(r)) { // case for no diff found
      return axios.post(response_url, r)
    }
    // make sure they're synchronouslly sent following each other if multiple chunks
    const responses = []
    for (const rr of r) {
      responses.push(await axios.post(response_url, rr))
    }
    return responses
  }))
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

module.exports = { worker, listener, github, getVercelMeta }
