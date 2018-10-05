const express = require('express')
const axios = require('axios')
const { WebClient } = require('@slack/client')

const { verifySlack } = require('./middleware')

const { GITHUB_TOKEN, SLACK_BOT_TOKEN } = process.env


// TODO: only supports 2-stage comparison for now
const PRODUCTS = {
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
}

const router = express.Router()


router.all('/', verifySlack, async (req, res, next) => {
  const {
    text: product = 'firstorder',
    channel_id: channel = 'C1FSD8B2T',
  } = req.body || {}
  const { baseURL = '', stages = [], key } = PRODUCTS[product] || {}

  if (!baseURL) {
    const error = new Error(`Product ${product} not found`)
    error.statusCode = 404
    return next(error)
  }

  const [ dev, prod ] = stages

  try {
    const responses = await Promise.all(
      stages.map((stage) => axios.get(`/${stage}`, { baseURL })))
    const [ head, base ] = responses.map(({ data = {} }) => data[key])

    const web = new WebClient(SLACK_BOT_TOKEN)
    const texts = []

    if (base === head) {
      texts.push(`*${product}* \`${dev}\` and \`${prod}\` are on the same \`${key}\` (\`${base}\`)`)
    } else {
      const { data: { commits } } = await axios.get(
        `/repos/EQWorks/${product}/compare/${base}...${head}`,
        {
          baseURL: 'https://api.github.com',
          auth: {
            username: 'woozyking',
            password: GITHUB_TOKEN,
          },
        }
      )
      const info = commits.map(({ sha, commit: { message } }) => ({ sha, message }))
      info.reverse()

      texts.push(`*${product}* \`${dev}\` and \`${prod}\` are not on the same \`${key}\``)
      texts.push(`\`$ git log --pretty=oneline ${base}...${head}\``)
      texts.push(`\`\`\`${JSON.stringify(info, null, 2)}\`\`\``)
    }

    await web.chat.postMessage({ channel, text: texts.join('\n') })

    return res.json({
      [dev]: base,
      [prod]: head,
    })
  } catch(err) {
    return next(err)
  }
})


module.exports = router
