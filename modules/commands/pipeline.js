const axios = require('axios')

const { datapipeline, invokeSlackWorker } = require('../lib/util')

const { PIPELINE_LIMIT = 300 } = process.env

const getCount = async () => {
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

const worker = async ({ response_url }) => {
  const { count, limit } = await getCount()
  return axios.post(response_url, {
    replace_original: true,
    text: `Pipeline usage: ${count}/${limit}`,
  })
}


const listener = async ({ command, ack, respond }) => {
  await ack()
  const { response_url } = command
  await invokeSlackWorker({ type: 'pipeline', payload: { response_url } })
  await respond('Checking pipeline usage...')
}

module.exports = { worker, listener }
