const express = require('express')
const serverless = require('serverless-http');
const bodyParser = require('body-parser')
const axios = require('axios')
const { Parser } = require('json2csv')

const PORT = process.env.PORT || 8000
const AUTH_JWT = process.env.AUTH_JWT || ''
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const SLACK_VERIFY_TOKEN = process.env.SLACK_VERIFY_TOKEN || ''
const VID_COMP_API = process.env.VID_COMP_API || ''
const WL_SEG_API = process.env.WL_SEG_API || ''
const SLACK_OVERLORD_WEBHOOK = process.env.SLACK_OVERLORD_WEBHOOK || ''
const SLACK_SNOKE_WEBHOOK = process.env.SLACK_SNOKE_WEBHOOK || ''

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))

app.use(bodyParser.json())

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

const verifySlack = (req, res, next) => {
  const token = req.body.token
  if (token === SLACK_VERIFY_TOKEN) {
    return next()
  }
  console.log('Cartman, is that you?')
  return res.status(403).json({
    text: 'Cartman, is that you?'
  })
}

const isInternal = (req, res, next) => {
  getEmail(req.body.user_id).then((email) => {
    if (/eqworks.com$/.test(email)) {
      return next()
    }
    console.log('This is open to eqworks.com internal user only')
    return res.status(403).json({
      text: 'This is open to eqworks.com internal user only',
      mrkdwn: true
    })
  })
}

app.all('/wl_seg_imps', verifySlack, isInternal, (req, res) => {
  const isoDateR = /\d{4}-[01]\d-[0-3]\d/
  const date = (req.body.text || '').trim().match(isoDateR)
  const params = {}
  if (date) {
    params.date = date[0]
  }
  axios.get('/dev/', {
    baseURL: WL_SEG_API,
    params,
    headers: {
      'eq-api-jwt': AUTH_JWT
    }
  }).then((resp) => {
    const p = new Parser({
      fields: ['whitelabelid', 'company', 'date', 'impressions']
    })
    return res.json({
      text: '```' + p.parse(resp.data) + '```',
      mrkdwn: true
    })
  }).catch((err) => {
    console.log(err)
    return res.json({
      text: `Error: ${((err.response || {}).data || {}).message || err.message || 'Unable to get wl segments impressions'}`,
      mrkdwn: true
    })
  })
})

app.all('/video_completion_report', verifySlack, (req, res) => {
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

app.all('/overlord-deploy', (req, res) => {
  if (req.body.branch !== 'maintenance') {
    // we don't care about deploy of branch other than maintenance
    return
  }

  const logPage = `${req.body.admin_url}/deploys/${req.body.id}`
  console.log(logPage)
  axios({
    method: 'post',
    url: SLACK_OVERLORD_WEBHOOK,
    data: {
      text: `You invoked overlord *maintenance* deployment\nTo switch to maintenance, checkout <${logPage}|*build status*> and click *publish deploy* when it finished`
    }
  }).then((resp) => {
    console.log('success', resp.data)
    return res.json({
      text: 'good'
    })
  }).catch((err) => {
    console.log(err)
  })
})

app.all('/snoke-deploy', (req, res) => {
  if (req.body.branch !== 'maintenance') {
    // we don't care about deploy of branch other than maintenance
    return
  }

  const logPage = `${req.body.admin_url}/deploys/${req.body.id}`
  console.log(logPage)
  axios({
    method: 'post',
    url: SLACK_SNOKE_WEBHOOK,
    data: {
      text: `You invoked snoke *maintenance* deployment\nTo switch to maintenance, checkout <${logPage}|*build status*> and click *publish deploy* when it finished`
    }
  }).then((resp) => {
    console.log('success', resp.data)
    return res.json({
      text: 'good'
    })
  }).catch((err) => {
    console.log(err)
  })
})

module.exports.handler = serverless(app)
