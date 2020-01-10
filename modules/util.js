const AWS = require('aws-sdk')

const { STAGE = 'dev' } = process.env


module.exports.lambda = new AWS.Lambda({
  apiVersion: '2015-03-31',
  region: 'us-east-1',
})

module.exports.getFuncName = f => `legion-${STAGE}-${f}`
