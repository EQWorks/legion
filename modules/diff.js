const express = require('express')
const axios = require('axios')
const NetlifyAPI = require('netlify')

const { verifySlack } = require('./middleware')

const { GITHUB_TOKEN, COMMIT_LIMIT = 10, NETLIFY_TOKEN } = process.env


// TODO: only supports 2-stage comparison for now
const SERVICES = {
  overseer: {
    baseURL: 'httsp://api.eqworks.io',
    stages: ['dev', 'beta'],
    key: 'OVERSEER_VER'
  },
  firstorder: {
    baseURL: 'https://api.locus.place',
    stages: ['dev', 'prod'],
    key: 'API_VER',
  },
  keywarden: {
    baseURL: 'https://auth.eqworks.io',
    stages: ['dev', 'prod'],
    key: 'KEYWARDEN_VER',
  },
}
const CLIENTS = {
  overlord: {
    siteId: 'https://overlord.eqworks.io',
    stages: ['master', 'prod'],
    head: 'master',
  },
  snoke: {
    siteId: 'console.locus.place',
    stages: ['dev', 'prod'],
    head: 'master',
  },
}

const router = express.Router()


const getGitDiff = async ({ product, base, head = 'master', dev, prod }) => {
  const cxtBlk = {
    type: 'context',
    elements: [
      {
        type: 'plain_text',
        text: `$ git log --pretty=oneline ${base}...${head}`,
      }
    ]
  }

  if (base === head) {
    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${product}* \`${dev}\` and \`${prod}\` are on the same commit (\`${base}\`)`,
          }
        },
        { type: 'divider' },
        cxtBlk,
      ],
    }
  }

  const { data: { commits, total_commits, status, html_url } } = await axios.get(
    `/repos/EQWorks/${product}/compare/${base}...${head}`,
    {
      baseURL: 'https://api.github.com',
      auth: {
        username: 'woozyking',
        password: GITHUB_TOKEN,
      },
    }
  )
  const info = commits.map(({
    sha,
    html_url,
    commit: { message, author, committer },
  }) => {
    const { name = '`Unknown Hacker`', date = '`Unknown Time`' } = (author || committer || {})
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: message },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: sha.slice(0, 7) },
          url: html_url,
          value: sha,
        },
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${name} - ${date}` }] },
    ]
  })
  info.reverse()

  return {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `
            *${product}* \`${dev}\` is ${status} by ${total_commits} compared to \`${prod}\`
            ${info.length > COMMIT_LIMIT ? `\n${COMMIT_LIMIT}/${info.length} most recent commits shown below` : ''}
          `.trim(),
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: `${base}...${head}` },
          url: html_url,
          value: `${base}...${head}`,
        },
      },
      { type: 'divider' },
      // TODO: Array.prototype.flat not avail in Node until v11+
      ...[].concat.apply([], info.length > COMMIT_LIMIT ? info.slice(0, COMMIT_LIMIT) : info),
      { type: 'divider' },
      cxtBlk,
    ],
  }
}

const getServiceMeta = async (product) => {
  const { baseURL = '', stages = [], key } = SERVICES[product] || {}
  const [dev, prod] = stages
  const responses = await Promise.all(stages.map((stage) => axios.get(`/${stage}`, { baseURL })))
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


router.all('/', verifySlack, async (req, res, next) => {
  const { text: product = 'firstorder' } = req.body || {}

  try {
    let r = {
      response_type: 'ephemeral',
      text: `Sorry, product ${product} not found`,
    }

    if (Object.keys(SERVICES).includes(product)) {
      r = await getGitDiff({ product, ...await getServiceMeta(product) })
    } else if (Object.keys(CLIENTS).includes(product)) {
      r = await getGitDiff({ product, ...await getClientMeta(product) })
    }

    return res.status(200).json(r)
  } catch(err) {
    return next(err)
  }
})


module.exports = router
