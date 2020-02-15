const express = require('express')
const serverless = require('serverless-http')
const bodyParser = require('body-parser')
const axios = require('axios')

const modules = require('./modules')
const { verifySlack } = require('./modules/middleware')

const app = express()

const { updateTask } = require('@eqworks/avail-bot')

const rawBodyBuffer = (req, _, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8')
  }
}

app.use(bodyParser.urlencoded({verify: rawBodyBuffer, extended: true }))
app.use(bodyParser.json({ verify: rawBodyBuffer }))

app.get('/', (_, res, next) => {
  axios.get('https://api.github.com/zen').then(({ data }) => res.send(data)).catch(next)
})

// secondary prefix for backward compat
Object.entries(modules).forEach(([uri, { route }]) => {
  app.use(`/${uri}`, verifySlack, route)
})

// https://o1u4dgxs7a.execute-api.us-east-1.amazonaws.com/dev/interactive
/*
{"type":"block_actions","team":{"id":"T1FDR4NG3","domain":"eqworks"},"user":{"id":"UDKQUMTNV","username":"shane.stratton","name":"shane.stratton","team_id":"T1FDR4NG3"},"api_app_id":"A6HPM5VC0","token":"m4Q8xY7jIYRbwM0W7u7utV30","container":{"type":"message","message_ts":"1581136311.002000","channel_id":"CCCB6QD9S","is_ephemeral":true},"trigger_id":"943038858992.49467158547.dde0a43e507f40a8a487834aa77a6bce","channel":{"id":"CCCB6QD9S","name":"bot-cmd"},"response_url":"https:\/\/hooks.slack.com\/actions\/T1FDR4NG3\/943059145717\/xEl65bpIwt34bx8HkKc5RvNc","actions":[{"action_id":"aZqDQ","block_id":"VlQco","text":{"type":"plain_text","text":"Approve","emoji":true},"value":"1159688855982005 \/\/ 1159688855981996 \/\/ 1159688855981999","style":"primary","type":"button","action_ts":"1581136319.685647"}]}
*/
// RESPOND TO ACTION BELOW
// TODO: generic utils for parsing this response for quick uptime
// TODO: decide how to "switch" based on response
//       ---> put it in button text and/or value?
//       ---> API calls to get app, command
// https://api.slack.com/reference/interaction-payloads/block-actions

// https://api.slack.com/apps/A6HPM5VC0/interactive-messages?
app.use('/interactive', (req, res, next) => {
  const parsed = JSON.parse(req.body.payload)
  console.log('interactive', parsed)
  const {
    type,
    response_url,
    user,
    channel: { id, name },
    actions: [{ value: action_value, style, type: action_type, text: { text } }], // TODO when would this be .length > 1

  } = parsed
  console.log('---user: ', user)
  if (user.username === 'shane.stratton') {
    const [module, taskId, customFieldId, value] = parsed.actions[0].value.split(' // ')
    if (module === 'vacay') {
      console.log(taskId, customFieldId, value)
      updateTask(taskId, { custom_fields: { [customFieldId]: value }})
        .then(res => {
          console.log('----- update task', res)
          /*
            {
                "replace_original": "true",
                "delete_original:" "true",
                "response_type": "ephemeral",
                "text": "Thanks for your request, we'll process it and get back to you."
            }
          */
          const { assignee: { name }, start_on, due_on, custom_fields } = res
          const status = custom_fields.find(o => o.name === 'Status').enum_value.name
          const date = start_on ? `${start_on} - ${due_on}` : due_on
          axios.post(response_url, {
            "text": `Updated *${name}'s* vacation on *${date}* to *${status}*`,
            "mrkdwn": true,
            "response_type": "ephemeral",
            "replace_original": false,
          })
        })
    }
  } else {
    axios.post(response_url, {
      "text": `Nice try *${user.username}*, you phony!`,
      "mrkdwn": true,
      "response_type": "in_channel",
      "replace_original": false,
    })
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
