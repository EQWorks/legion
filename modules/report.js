const express = require('express')
const axios = require('axios')

const { verifySlack } = require('./middleware')


const router = express.Router()

const {
  SLACK_BOT_TOKEN = '',
  VID_COMP_API = '',
} = process.env


// second match for backward compat
router.all(['video_completion', '/video_completion_report'], verifySlack, (req, res) => {
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
  axios.get('https://slack.com/api/users.info', {
    params: {
      token: SLACK_BOT_TOKEN,
      user: req.body.user_id
    }
  }).then((resp) => {
    const {
      data: {
        user: {
          profile: { email: user } = {}
        } = {}
      } = {}
    } = resp
    return axios.get('/dev/receiver', {
      baseURL: VID_COMP_API,
      params: {
        camp_code: parts[0],
        start: parts[1],
        end: parts[2],
        user,
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


module.exports = router
