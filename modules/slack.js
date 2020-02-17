const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName  } = require('./util')

const { DEPLOYED = false } = process.env

const token = process.env.SLACK_TOKEN || 'xoxp-49467158547-461844741777-914376058981-a4d375517e47575d8321643bb68ae0f9'
const web = new WebClient(token)

const conversationId = 'CCCB6QD9S';

(async () => {

  // Post a message to the channel, and await the result.
  // Find more arguments and details of the response: https://api.slack.com/methods/chat.postMessage
  // const result = await web.chat.postMessage({
  //   text: 'Hello world!',
  //   channel: conversationId,
  // })
  // const result = await web.apiCall('search.messages',{
  //   query: 'thread: !!## in:bot-cmd from:shane.stratton on:2/15/2020',
  // })
  const result = await web.search.messages({
    query: '!!##thread: <so-so-so-unique>',
  })

  const post = await web.chat.postEphemeral({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${JSON.stringify(result.messages.matches.filter(msg => !msg.previous).map(msg => msg.text))}\`\`\``
        },
      }
    ],
    user: 'UDKQUMTNV',
    channel: conversationId,
  })
  // The result contains an identifier for the message, `ts`.
  // thread messages normally use thread_ts
  // search.messages does not return this
  // .previous seems to indicate a child
  console.log(result.messages.matches.filter(msg => !msg.previous).map(msg => msg.text))
})()

const worker = async ({ response_url, command, value }) => {

  return axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: [
      { type: 'section', text: { type: 'plain_text', emoji: true, text: 'Team Avail' } },
      ...Object.values({}).map(({ text, peepo }) => ([
        { type: 'section', text: { type: 'plain_text', emoji: true, text } },
        {
          type: 'context',
          elements: peepo.map(({ name, routine }) => ({
            type: 'plain_text',
            text: `${name}${routine ? ' (Routine)' : ''}`,
          })),
        },
      ])).flat(),
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'plain_text', emoji: true, text: `:clock9: ${new Date().toISOString()}` },
          { type: 'mrkdwn', text: '<|Timeline>' },
        ],
      },
    ],
  })
}

const route = (req, res) => {
  const { text = '', response_url } = req.body
  // process text from command
  let command = ''
  let value

  const payload = { command, value, response_url }
  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to check slack' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Checking Slack Threads...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Checking Slack Threads...' })
  }
}


module.exports = { worker, route }
