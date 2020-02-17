const axios = require('axios')
const { lambda, getFuncName  } = require('./util')

const { DEPLOYED = false } = process.env

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
