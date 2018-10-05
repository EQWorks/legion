const express = require('express')
const axios = require('axios')

const { verifySlack } = require('./middleware')


const router = express.Router()

const {
  OVERLORD_MAINT_BUILD_HOOK = '',
  SLACK_OVERLORD_WEBHOOK = '',
  SNOKE_MAINT_BUILD_HOOK = '',
  SLACK_SNOKE_WEBHOOK = '',
} = process.env

const PROJECTS = {
  overlord: {
    buildHook: OVERLORD_MAINT_BUILD_HOOK,
    slackHook: SLACK_OVERLORD_WEBHOOK,
  },
  snoke: {
    buildHook: SNOKE_MAINT_BUILD_HOOK,
    slackHook: SLACK_SNOKE_WEBHOOK,
  },
}


router.post('/:project', verifySlack, (req) => {
  const { user_name, response_url } = req.body
  const { project } = req.params

  if (!Object.keys(PROJECTS).includes(project)) {
    axios({
      method: 'post',
      url: response_url,
      data: {
        response_type: 'ephemeral',
        text: `Sorry, project ${project} is not supported`
      }
    })
    return
  }

  axios({
    method: 'post',
    url: PROJECTS[project].slackHook,
    data: {
      text: `*${user_name}* invoked ${project} *maintenance* deployment`
    }
  }).catch((err) => {
    console.error(err)
  })

  axios({
    method: 'post',
    url: PROJECTS[project].buildHook,
    data: {}
  }).catch((err) => {
    console.error(err)
  })
})


module.exports = router
