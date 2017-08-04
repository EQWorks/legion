const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios')

const PORT = process.env.PORT || 8000
const OVERSEER_API_BASE = process.env.OVERSEER_API_BASE || 'https://api.eqworks.com/beta'
const OVERSEER_API_USER = process.env.OVERSEER_API_USER || ''
const OVERSEER_API_KEY = process.env.OVERSEER_API_KEY || ''

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))

app.get('/', (req, res) => {
  return res.send('We Are Legion')
})

app.post('/', (req, res) => {
  /*
    { token: 'm4Q8xY7jIYRbwM0W7u7utV30',
    team_id: 'T1FDR4NG3',
    team_domain: 'eqworks',
    channel_id: 'C1FDR4QJF',
    channel_name: 'general',
    user_id: 'U1FF6KSF9',
    user_name: 'woozyking',
    command: '/stats',
    text: '123 123 123',
    response_url: 'https://hooks.slack.com/commands/T1FDR4NG3/222480208434/uAxfp7cYvZDZe6EGPZMMxUAp',
    trigger_id: '222406942915.49467158547.d9696b3ffac22d1f11a51b72c1032ce5' }
  */
  console.log(req.body)
  // TODO: comprehensive verification of channel, initiating user, and others
  if (req.body.token !== 'm4Q8xY7jIYRbwM0W7u7utV30' || req.body.channel_id !== 'C1FSD8B2T') {
    return res.json({
      text: 'You have no power here'
    })
  }
  let parts = (req.body.text || '').split(' ')
  let campCode = parts[0]
  let type = (parts[1] || 'summary').toLowerCase()

  if (type === 'summary') {
    axios({
      timeout: 2500,
      method: 'GET',
      url: `/campaigns/${campCode}`,
      baseURL: OVERSEER_API_BASE,
      headers: {
        'eq-api-user': OVERSEER_API_USER,
        'eq-api-key': OVERSEER_API_KEY
      },
      params: {
        summary: true
      }
    }).then((response) => {
      const ancestors = response.data.ancestors || []
      const metadata = response.data.metadata || {}
      const summary = response.data.summary || {}

      return res.json({
        text: `Found Campaign \`${campCode}\`. Visit https://overlord3.eqworks.com/campaign/${campCode} for details`,
        attachments: [
          {
            title: 'Metadata',
            fields: [
              {
                title: 'Name',
                value: metadata.Name
              },
              {
                title: 'Customer',
                value: `${ancestors[1].name} (ID: ${ancestors[1].ID}) of WL ${ancestors[0].name} (ID: ${ancestors[0].ID})`
              },
              {
                title: 'State',
                value: metadata.Enabled ? 'Enabled' : 'Disabled',
                short: true
              },
              {
                title: 'Level',
                value: metadata.Level,
                short: true
              },
              {
                title: 'Currency',
                value: metadata.Currency,
                short: true
              },
              {
                title: 'Time Zone',
                value: metadata.TimeZone,
                short: true
              },
              {
                title: 'Start',
                value: metadata.StartDate,
                short: true
              },
              {
                title: 'End',
                value: metadata.EndDate,
                short: true
              }
            ],
            mrkdwn_in: ['text', 'fields']
          },
          {
            title: 'Lifetime Summary',
            fields: [
              {
                title: 'Impressions',
                value: (summary.impressions || 0).toLocaleString(),
                short: true
              },
              {
                title: 'Clicks',
                value: (summary.clicks || 0).toLocaleString(),
                short: true
              },
              {
                title: 'Actions',
                value: (summary.actions || 0).toLocaleString(),
                short: true
              },
              {
                title: 'Revenue',
                value: `$${(summary.Revenue || 0).toLocaleString()}`,
                short: true
              },
              {
                title: 'Cost',
                value: `$${(summary.Cost || 0).toLocaleString()}`,
                short: true
              },
              {
                title: 'Profit',
                value: `$${(summary.Profit || 0).toLocaleString()}`,
                short: true
              }
            ],
            mrkdwn_in: ['text', 'fields']
          }
        ],
        mrkdwn: true
      })
    }).catch((err) => {
      let message = '`overseer` API error'
      if (err.response) {
        message = `\`${(err.response.data || {}).message || message}\``
      }
      return res.json({
        text: message,
        mrkdwn: true
      })
    })
  } else {
    return res.json({
      text: 'WIP'
    })
  }
})

app.listen(PORT, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Listening on port ${PORT}`)
})
