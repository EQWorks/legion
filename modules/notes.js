const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName } = require('./util')


const DEV_CHANNEL_ID = 'G1FDULP1R'
const { SLACK_OAUTH, DEPLOYED } = process.env
const web = new WebClient(SLACK_OAUTH)

const worker = async ({ channel, response_url, ts }) => {
  const { messages: thread } = await web.conversations.replies({ channel, ts })
  const updates = thread.filter(({ text }) => text.startsWith('did') || text.startsWith('Did'))
}

const route = (req, res) => {
  const { text, response_url } = req.body

  // text = <https://eqworks.slack.com/archives/G1FDULP1R/p1603807314106800>
  const r = /<https:\/\/eqworks.slack.com\/archives\/(?<channel>.*)\/p(?<TS>.*)>/
  const [_, channel, timestamp] = text.match(r)
  if (channel !== DEV_CHANNEL_ID) {
    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Please provide the link of the meeting notes from the #dev channel',
          },
        },
      ],
    })
  }
  const ts = (Number(timestamp) / 1000000).toFixed(6)

  const payload = { response_url, ts, channel }

  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'notes', payload }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to compile' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
  }
}

module.exports = { worker, route }