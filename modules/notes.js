const axios = require('axios')
const { lambda, getFuncName  } = require('./util')


const { DEPLOYED } = process.env
const worker = async () => {

}

const route = (req, res) => {
  const { text, response_url } = req.body

  const payload = { text, response_url }

  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'notes', payload }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to compile' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
  }
}

module.exports = { worker, route }