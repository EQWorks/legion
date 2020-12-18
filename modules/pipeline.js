const axios = require('axios')

const { lambda, datapipeline, getFuncName } = require('./util')

const { PIPELINE_LIMIT = 300, DEPLOYED = false } = process.env


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


const route = ({ body: { response_url } }, res) => {
  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'pipeline', payload: { response_url } }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to check' })
      }
      return res.status(200).json({
        response_type: 'ephemeral',
        text: 'Checking pipeline usage...',
      })
    })
  } else {
    worker({ response_url }).catch(console.error)
    return res.status(200).json({
      response_type: 'ephemeral',
      text: 'Checking pipeline usage...',
    })
  }
}

module.exports = { worker, route }
