const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios')

const PORT = process.env.PORT || 8000
// const OVERSEER_API_BASE = process.env.OVERSEER_API_BASE || 'https://api.eqworks.com/beta'
// const OVERSEER_API_USER = process.env.OVERSEER_API_USER || ''
// const OVERSEER_API_KEY = process.env.OVERSEER_API_KEY || ''
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const VID_COMP_API = process.env.VID_COMP_API || ''

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))

app.get('/', (req, res) => {
  return res.send('We Are Legion')
})

const getEmail = (user_id) => {
  return axios.get('https://slack.com/api/users.info', {
    params: {
      token: SLACK_BOT_TOKEN,
      user: user_id
    }
  }).then((resp) => {
    return (((resp.data || {}).user || {}).profile || {}).email
  })
}

app.all('/video_completion_report', (req, res) => {
  /*
    { token: '...',
    team_id: '...',
    team_domain: 'eqworks',
    channel_id: '...',
    channel_name: 'general',
    user_id: '...',
    user_name: 'woozyking',
    command: '/stats',
    text: '123 123 123',
    response_url: '...',
    trigger_id: '...' }
  */
  // console.log(req.body)
  const parts = (req.body.text || '').split(/\s+/)
  if (parts.length < 3) {
    return res.json({
      text: 'Error: please conform to the command format `/vidcomp [camp_code] [start] [end]` without the square brackets',
      mrkdwn: true
    })
  }
  getEmail(req.body.user_id).then((email) => {
    return axios.get('/dev/receiver', {
      baseURL: VID_COMP_API,
      params: {
        camp_code: parts[0],
        start: parts[1],
        end: parts[2],
        user: email
      }
    })
  }).then((resp) => {
    return res.json({
      text: `Requested: ${resp.data.message || 'report result will be sent through email once it is done'}`,
      mrkdwn: true
    })
  }).catch((err) => {
    return res.json({
      text: `Error: ${((err.response || {}).data || {}).message || err.message || 'Unable to request video completion report'}`,
      mrkdwn: true
    })
  })
})

app.listen(PORT, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Listening on port ${PORT}`)
})
