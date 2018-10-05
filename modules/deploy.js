const express = require('express')
const axios = require('axios')

const router = express.Router()

const {
  SLACK_OVERLORD_WEBHOOK = '',
  SLACK_SNOKE_WEBHOOK = '',
} = process.env


router.all('/overlord', (req, res) => {
  if (req.body.branch !== 'maintenance') {
    // we don't care about deploy of branch other than maintenance
    return
  }

  const logPage = `${req.body.admin_url}/deploys/${req.body.id}`
  axios({
    method: 'post',
    url: SLACK_OVERLORD_WEBHOOK,
    data: {
      text: `*Maintenance* deployment started\nTo switch to maintenance, checkout <${logPage}|*build status*> and click *publish deploy* when it finished`
    }
  }).then(() => {
    return res.json({ text: 'good' })
  }).catch((err) => {
    console.error(err)
  })
})

router.all('/snoke', (req, res) => {
  if (req.body.branch !== 'maintenance') {
    // we don't care about deploy of branch other than maintenance
    return
  }

  const logPage = `${req.body.admin_url}/deploys/${req.body.id}`
  axios({
    method: 'post',
    url: SLACK_SNOKE_WEBHOOK,
    data: {
      text: `*Maintenance* deployment started\nTo switch to maintenance, checkout <${logPage}|*build status*> and click *publish deploy* when it finished`
    }
  }).then(() => {
    return res.json({ text: 'good' })
  }).catch((err) => {
    console.error(err)
  })
})


module.exports = router
