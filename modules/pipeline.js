const AWS = require('aws-sdk')
const express = require('express')

const { verifySlack } = require('./middleware')

const datapipeline = new AWS.DataPipeline({ region: 'us-east-1' })
const { PIPELINE_LIMIT = 300 } = process.env

const router = express.Router()


const count = async () => {
  let count = 0
  let hasMoreResults = true
  let marker = ''

  while (hasMoreResults) {
    const res = await datapipeline.listPipelines({ marker }).promise()
    ;({ marker, hasMoreResults } = res)
    count += res.pipelineIdList.length
  }

  return { count, limit: PIPELINE_LIMIT }
}

router.all('/', verifySlack, (_, res, next) => {
  // const { text: command = 'count' } = body || {}

  // const r = {
  //   response_type: 'ephemeral',
  //   text: `Sorry, command ${command} not found`,
  // }
  count().then(({ count, limit }) => {
    return res.status(200).json({
      response_type: 'in_channel',
      text: `Pipeline usage: ${count}/${limit}`,
    })
  }).catch(next)
})

module.exports = router
