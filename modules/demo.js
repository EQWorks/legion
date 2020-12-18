// const axios = require('axios')
// const { } = require('../google-api/googleapis')
const {  invokeSlackWorker, errMsg } = require('./util')
const { WebClient } = require('@slack/web-api')


const { DEPLOYED, SLACK_OAUTH } = process.env
const web = new WebClient(SLACK_OAUTH)

const view = {
  'callback_id': 'demo',
  'title': {
    'type': 'plain_text',
    'text': 'Demo Calendar',
    'emoji': true
  },
  'submit': {
    'type': 'plain_text',
    'text': 'Book',
    'emoji': true
  },
  'type': 'modal',
  'blocks': [
    {
      'type': 'input',
      'element': {
        'type': 'datepicker',
        'placeholder': {
          'type': 'plain_text',
          'text': 'Select a date',
          'emoji': true
        },
        'action_id': 'datepicker'
      },
      'label': {
        'type': 'plain_text',
        'text': 'Date',
        'emoji': true
      }
    },
    {
      'type': 'input',
      'element': {
        'type': 'timepicker',
        'initial_time': '09:30',
        'placeholder': {
          'type': 'plain_text',
          'text': 'Select time',
          'emoji': true
        },
        'action_id': 'timepicker-start'
      },
      'label': {
        'type': 'plain_text',
        'text': 'Start',
        'emoji': true
      }
    },
    {
      'type': 'input',
      'element': {
        'type': 'timepicker',
        'placeholder': {
          'type': 'plain_text',
          'text': 'Select time',
          'emoji': true
        },
        'action_id': 'timepicker-end'
      },
      'label': {
        'type': 'plain_text',
        'text': 'End',
        'emoji': true
      }
    }
  ]
}

const worker = async ({ response_url, trigger_id }) => {
  return web.views.open({
    trigger_id,
    view: {...view, private_metadata: response_url},
  })
}

const route = (req, res) => {
  // extract payload from slash command
  const {
    response_url,
    trigger_id,
  } = req.body
  const payload = { trigger_id, response_url }

  try {

    if (!DEPLOYED) {
      worker(payload).catch(console.error)
    } else {
      invokeSlackWorker({ type: 'diff', payload })
    }

    res.status(200).json({
      response_type: 'ephemeral',
      text: 'Add event details...',
    })
  } catch (err) {
    console.error(err)
    return res.status(200).json({ response_type: 'ephemeral', text: `Failed to save this event:\n${errMsg(err)}` })
  }
}

module.exports = { worker, route }
