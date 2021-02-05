const express = require('express')
const serverless = require('serverless-http')
const bodyParser = require('body-parser')
const axios = require('axios')

const { lambda, getFuncName } = require('./modules/util')
const modules = require('./modules')
const { verifySlack } = require('./modules/middleware')
const { bdayInteractive } = require('./modules/bday-interactive')
const { gCalendarCreateEvent } = require('./google-api/googleapis')

const { DEPLOYED } = process.env
const app = express()

const rawBodyBuffer = (req, _, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8')
  }
}

app.use(bodyParser.urlencoded({ verify: rawBodyBuffer, extended: true }))
app.use(bodyParser.json({ verify: rawBodyBuffer }))

app.get('/', (_, res, next) => {
  axios.get('https://api.github.com/zen').then(({ data }) => res.send(data)).catch(next)
})

// if (process.env.DEPLOYED) {
//   app.use(verifySlack)
// }

// secondary prefix for backward compat
Object.entries(modules).forEach(([uri, { route }]) => {
  app.use(`/${uri}`, route)
})

// https://o1u4dgxs7a.execute-api.us-east-1.amazonaws.com/dev/interactive
/*
---- BLOCK ACTION REFERENCE ----
https://api.slack.com/apps/A6HPM5VC0/interactive-messages
https://api.slack.com/reference/interaction-payloads/block-actions
e.g.
{
  "type": "block_actions",
  "team": {
    "id": "T1FDR4NG3",
    "domain": "eqworks"
  },
  "user": {
    "id": "UDKQUMTNV",
    "username": "shane.stratton",
    "name": "shane.stratton",
    "team_id": "T1FDR4NG3"
  },
  "api_app_id": "A6HPM5VC0",
  "token": "m4Q8xY7jIYRbwM0W7u7utV30",
  "container": {
    "type": "message",
    "message_ts": "1581136311.002000",
    "channel_id": "CCCB6QD9S",
    "is_ephemeral": true
  },
  "trigger_id": "943038858992.49467158547.dde0a43e507f40a8a487834aa77a6bce",
  "channel": {
    "id": "CCCB6QD9S",
    "name": "bot-cmd"
  },
  "response_url": "https://hooks.slack.com/actions/T1FDR4NG3/943059145717/xEl65bpIwt34bx8HkKc5RvNc",
  "actions": [
    {
      "action_id": "aZqDQ",
      "block_id": "VlQco",
      "text": {
        "type": "plain_text",
        "text": "Approve",
        "emoji": true
      },
      "value": "1159688855982005 // 1159688855981996 // 1159688855981999",
      "style": "primary",
      "type": "button",
      "action_ts": "1581136319.685647"
    }
  ]
}
*/
app.use('/interactive', (req, res) => {
  const parsed = JSON.parse(req.body.payload)

  const {
    type,
    view: {
      id,
      hash,
      callback_id,
      private_metadata,
      state: { values }, // only available from submission
      blocks,
    },
    actions = [],
    user: { id: sender },
    // much more avb inside, check documentation
  } = parsed
  if (callback_id === 'demo') {
    const {
      date: { datepicker: { selected_date: date } },
      startTime: { 'timepicker-start': { selected_time: start } },
      endTime: { 'timepicker-end': { selected_time: end } }
    } = values

    const text = { type: 'mrkdwn' }
    const blocks = [
      {
        type: 'section',
        text,
      },
    ]
    return gCalendarCreateEvent({ date, start, end }).then(([link]) => {
      text.text = `:money_mouth_face: Event added to the <${link}|Demo calendar>`
      return axios.post(private_metadata, {
        response_type: 'ephemeral',
        blocks,
      })
    }).catch((err) => {
      console.error(err)
      text.text = ':no_entry_sign: *COULD NOT* save this event.'
      if (err.errors.length) {
        text.text += `  Error: ${err.errors[0].message}`
      }
      return axios.post(private_metadata, {
        response_type: 'ephemeral',
        blocks,
      })
    }).finally(() => res.status(200).json({ 'response_action': 'clear' }))
  }

  if (callback_id === 'bday') {
    // manipulate data received from submission
    const { data = {}, errors = {} } = bdayInteractive({ type, values })
    if (Object.values(errors).length) {
      return res.status(200).json({ response_action: 'errors', errors })
    }
    const {
      ref,
      response_url,
      command,
      channel_id,
    } = JSON.parse(private_metadata)

    const payload = {
      ref,
      command,
      type,
      view_id: id,
      hash,
      response_url,
      data,
      blocks,
      action: actions[0] || [],
      channel_id,
      sender
    }

    const { worker } = modules['bday']

    if (DEPLOYED) {
      lambda.invoke({
        FunctionName: getFuncName('slack'),
        InvocationType: 'Event',
        Payload: JSON.stringify({ type: 'bday', payload }),
      }, (err) => {
        if (err) {
          console.error(err)
          return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to process bday command' })
        }
        if (type === 'view_submission') {
          return res.status(200).json({ 'response_action': 'clear' })
        }
        return res.sendStatus(200)
      })
    } else {
      worker(payload).catch(console.error)
      if (type === 'view_submission') {
        // needs to have only <response_action> for modals submission
        return res.status(200).json({ 'response_action': 'clear' })
      }
      // modal interactions need to have acknowledgement
      return res.sendStatus(200)
    }
  }

  // asana authorization modal
  if (callback_id === 'asana-authorizer') {
    const payload = { type, values }
    const { worker } = modules['journal']

    worker(payload).catch(console.error)

    if (type === 'view_submission') {
      return res.status(200).json({ 'response_action': 'clear' })
    }
    return res.sendStatus(200)
  }
})

// catch-all error handler
// eslint disable otherwise not able to catch errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let { logLevel, statusCode } = err
  const { message } = err
  logLevel = logLevel || 'ERROR'
  statusCode = statusCode || 500
  // app log
  // eslint-disable-next-line no-console
  console.log(`[${logLevel}] - ${statusCode} - ${message}`)
  if (logLevel === 'ERROR') {
    console.error(`[ERROR] ${message}`, err.stack || err)
  }
  // API response
  return res.json({
    statusCode,
    logLevel,
    message,
  })
})


if (require.main === module) {
  const PORT = process.env.PORT || 8000
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening on port ${PORT}`)
  })
} else {
  module.exports.handler = serverless(app)
}
