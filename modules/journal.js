const axios = require('axios')
const { WebClient } = require('@slack/web-api')

const { getAuthorizeUrl, tokenExchange } = require('./asana-test/client')
const { createJournal } = require('./asana-test/dev-journal.js')


const { SLACK_OAUTH } = process.env
const web = new WebClient(SLACK_OAUTH)
const COMMANDS = ['last workday', 'description', 'init']

const url = getAuthorizeUrl()
let response_url
const worker = async ({ command, response_url: r, trigger_id, type, values }) => {
  if (command === 'init') {
    if (r) response_url = r
    return web.views.open({
      trigger_id,
      view: {
        type: 'modal',
        callback_id: 'asana-authorizer',
        title: {
          type: 'plain_text',
          text: 'Connect to Asana'
        },
        blocks: [
          {
            type: 'section',
            block_id: 'asana-token-exchange',
            text: {
              type: 'mrkdwn',
              text: 'Submit token in the field below.',
            },
            accessory: {
              type: 'button',
              style: 'primary',
              text: {
                type: 'plain_text',
                text: 'Get Token',
              },
              action_id: 'asana-authorize-url',
              url,
            }
          },
          {
            type: 'input',
            block_id: 'asana-auth-token',
            label: {
              type: 'plain_text',
              text: 'Token',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'token-text-input',
              placeholder: {
                type: 'plain_text',
                text: 'Enter your token here...'
              },
            },
          },
        ],
        submit: {
          type: 'plain_text',
          text: 'Send',
        },
      }
    })
  }

  if (type === 'view_submission') {
    const { 'asana-auth-token': { 'token-text-input': { value: code } } } = values
    const asanaCreds = await tokenExchange({ code })
    await createJournal(asanaCreds)
    return axios.post(response_url, {
      response_type: 'ephemeral',
      text: 'Successfully connected.'
    })
  }
}

const route = (req, res) => {  
  const { text = '', response_url, trigger_id } = req.body
  if (text !== '' && !COMMANDS.includes(text)) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `"${text}" not supported.`
    })
  }

  const payload = { command: text, response_url, trigger_id }
  worker(payload).catch(console.error)
  return res.status(200).json({
    response_type: 'ephemeral',
    text: 'Got it! Connecting with Asana now...'
  })
}

module.exports = { worker, route }

